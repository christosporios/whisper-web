import React, { useCallback, useEffect, useState, useRef } from "react";
import axios from "axios";
import Modal from "./modal/Modal";
import { UrlInput } from "./modal/UrlInput";
import AudioPlayer from "./AudioPlayer";
import { TranscribeButton } from "./TranscribeButton";
import Constants from "../utils/Constants";
import { Transcriber, TranscriberData } from "../hooks/useTranscriber";
import Progress from "./Progress";
import AudioRecorder from "./AudioRecorder";
import { convertAndSaveAudio } from "light-audio-converter";

function titleCase(str: string) {
    str = str.toLowerCase();
    return (str.match(/\w+.?/g) || [])
        .map((word) => {
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join("");
}

// List of supported languages:
// https://help.openai.com/en/articles/7031512-whisper-api-faq
// https://github.com/openai/whisper/blob/248b6cb124225dd263bb9bd32d060b6517e067f8/whisper/tokenizer.py#L79
const LANGUAGES = {
    en: "english",
    zh: "chinese",
    de: "german",
    es: "spanish/castilian",
    ru: "russian",
    ko: "korean",
    fr: "french",
    ja: "japanese",
    pt: "portuguese",
    tr: "turkish",
    pl: "polish",
    ca: "catalan/valencian",
    nl: "dutch/flemish",
    ar: "arabic",
    sv: "swedish",
    it: "italian",
    id: "indonesian",
    hi: "hindi",
    fi: "finnish",
    vi: "vietnamese",
    he: "hebrew",
    uk: "ukrainian",
    el: "greek",
    ms: "malay",
    cs: "czech",
    ro: "romanian/moldavian/moldovan",
    da: "danish",
    hu: "hungarian",
    ta: "tamil",
    no: "norwegian",
    th: "thai",
    ur: "urdu",
    hr: "croatian",
    bg: "bulgarian",
    lt: "lithuanian",
    la: "latin",
    mi: "maori",
    ml: "malayalam",
    cy: "welsh",
    sk: "slovak",
    te: "telugu",
    fa: "persian",
    lv: "latvian",
    bn: "bengali",
    sr: "serbian",
    az: "azerbaijani",
    sl: "slovenian",
    kn: "kannada",
    et: "estonian",
    mk: "macedonian",
    br: "breton",
    eu: "basque",
    is: "icelandic",
    hy: "armenian",
    ne: "nepali",
    mn: "mongolian",
    bs: "bosnian",
    kk: "kazakh",
    sq: "albanian",
    sw: "swahili",
    gl: "galician",
    mr: "marathi",
    pa: "punjabi/panjabi",
    si: "sinhala/sinhalese",
    km: "khmer",
    sn: "shona",
    yo: "yoruba",
    so: "somali",
    af: "afrikaans",
    oc: "occitan",
    ka: "georgian",
    be: "belarusian",
    tg: "tajik",
    sd: "sindhi",
    gu: "gujarati",
    am: "amharic",
    yi: "yiddish",
    lo: "lao",
    uz: "uzbek",
    fo: "faroese",
    ht: "haitian creole/haitian",
    ps: "pashto/pushto",
    tk: "turkmen",
    nn: "nynorsk",
    mt: "maltese",
    sa: "sanskrit",
    lb: "luxembourgish/letzeburgesch",
    my: "myanmar/burmese",
    bo: "tibetan",
    tl: "tagalog",
    mg: "malagasy",
    as: "assamese",
    tt: "tatar",
    haw: "hawaiian",
    ln: "lingala",
    ha: "hausa",
    ba: "bashkir",
    jw: "javanese",
    su: "sundanese",
};

export enum AudioSource {
    URL = "URL",
    FILE = "FILE",
    RECORDING = "RECORDING",
}

interface Props {
    transcriber: Transcriber;
    transcribedData?: TranscriberData;
}

export function AudioManager({ transcriber, transcribedData }: Props) {
    const [progress, setProgress] = useState<number | undefined>(undefined);
    const [audioData, setAudioData] = useState<
        | {
            buffer: AudioBuffer;
            url: string;
            source: AudioSource;
            mimeType: string;
        }
        | undefined
    >(undefined);
    const [audioDownloadUrl, setAudioDownloadUrl] = useState<
        string | undefined
    >(undefined);
    const [audioDuration, setAudioDuration] = useState(0);

    const isAudioLoading = progress !== undefined;

    const resetAudio = () => {
        setAudioData(undefined);
        setAudioDownloadUrl(undefined);
    };

    const setAudioFromDownload = async (
        data: ArrayBuffer,
        mimeType: string,
    ) => {
        const audioCTX = new AudioContext({
            sampleRate: Constants.SAMPLING_RATE,
        });
        const blobUrl = URL.createObjectURL(
            new Blob([data], { type: "audio/*" }),
        );
        const decoded = await audioCTX.decodeAudioData(data);
        setAudioData({
            buffer: decoded,
            url: blobUrl,
            source: AudioSource.URL,
            mimeType: mimeType,
        });
    };

    const setAudioFromRecording = async (data: Blob) => {
        resetAudio();
        setProgress(0);
        const blobUrl = URL.createObjectURL(data);
        const fileReader = new FileReader();
        fileReader.onprogress = (event) => {
            setProgress(event.loaded / event.total || 0);
        };
        fileReader.onloadend = async () => {
            const audioCTX = new AudioContext({
                sampleRate: Constants.SAMPLING_RATE,
            });
            const arrayBuffer = fileReader.result as ArrayBuffer;
            const decoded = await audioCTX.decodeAudioData(arrayBuffer);
            setProgress(undefined);
            setAudioData({
                buffer: decoded,
                url: blobUrl,
                source: AudioSource.RECORDING,
                mimeType: data.type,
            });
        };
        fileReader.readAsArrayBuffer(data);
    };

    const downloadAudioFromUrl = async (
        requestAbortController: AbortController,
    ) => {
        if (audioDownloadUrl) {
            try {
                setAudioData(undefined);
                setProgress(0);
                const { data, headers } = (await axios.get(audioDownloadUrl, {
                    signal: requestAbortController.signal,
                    responseType: "arraybuffer",
                    onDownloadProgress(progressEvent) {
                        setProgress(progressEvent.progress || 0);
                    },
                })) as {
                    data: ArrayBuffer;
                    headers: { "content-type": string };
                };

                let mimeType = headers["content-type"];
                if (!mimeType || mimeType === "audio/wave") {
                    mimeType = "audio/wav";
                }
                setAudioFromDownload(data, mimeType);
            } catch (error) {
                console.log("Request failed or aborted", error);
            } finally {
                setProgress(undefined);
            }
        }
    };

    // When URL changes, download audio
    useEffect(() => {
        if (audioDownloadUrl) {
            const requestAbortController = new AbortController();
            downloadAudioFromUrl(requestAbortController);
            return () => {
                requestAbortController.abort();
            };
        }
    }, [audioDownloadUrl]);

    const audioRef = useRef<HTMLAudioElement>(null);

    // Connect the audio element to the transcriber
    useEffect(() => {
        transcriber.setAudioElement(audioRef.current);
    }, [transcriber]);

    // Add useEffect to track audio duration
    useEffect(() => {
        if (audioRef.current) {
            const audio = audioRef.current;
            if (audio.duration) {
                setAudioDuration(audio.duration);
            }
            const updateDuration = () => setAudioDuration(audio.duration);
            audio.addEventListener("loadedmetadata", updateDuration);
            return () => {
                audio.removeEventListener("loadedmetadata", updateDuration);
            };
        }
    }, [audioData]);

    return (
        <div className='w-full flex flex-col items-center gap-4'>
            <div className='flex flex-col justify-center items-center rounded-lg bg-white shadow-xl shadow-black/5 ring-1 ring-slate-700/10'>
                <div className='flex flex-row space-x-2 py-2 w-full px-2'>
                    <UrlTile
                        icon={<AnchorIcon />}
                        text={"From URL"}
                        onUrlUpdate={(e) => {
                            transcriber.onInputChange();
                            setAudioDownloadUrl(e);
                        }}
                    />
                    <VerticalBar />
                    <FileTile
                        icon={<FolderIcon />}
                        text={"From file"}
                        onFileUpdate={(decoded, blobUrl, mimeType) => {
                            transcriber.onInputChange();
                            setAudioData({
                                buffer: decoded,
                                url: blobUrl,
                                source: AudioSource.FILE,
                                mimeType: mimeType,
                            });
                        }}
                    />
                    {navigator.mediaDevices && (
                        <>
                            <VerticalBar />
                            <RecordTile
                                icon={<MicrophoneIcon />}
                                text={"Record"}
                                setAudioData={(e) => {
                                    transcriber.onInputChange();
                                    setAudioFromRecording(e);
                                }}
                            />
                        </>
                    )}
                </div>
                {
                    <AudioDataBar
                        progress={isAudioLoading ? progress : +!!audioData}
                        transcribedData={transcribedData}
                        audioDuration={audioDuration}
                    />
                }
            </div>
            {audioData && (
                <>
                    <AudioPlayer
                        ref={audioRef}
                        audioUrl={audioData.url}
                        mimeType={audioData.mimeType}
                    />

                    <div className='relative w-full flex justify-center items-center'>
                        <TranscribeButton
                            onClick={() => {
                                if (audioRef.current) {
                                    transcriber.start(audioData.buffer);
                                }
                            }}
                            isModelLoading={transcriber.isModelLoading}
                            isTranscribing={transcriber.isBusy}
                        />

                        <SettingsTile
                            className='absolute right-4'
                            transcriber={transcriber}
                            icon={<SettingsIcon />}
                        />
                    </div>
                    {transcriber.progressItems.length > 0 && (
                        <div className='relative z-10 p-4 w-full'>
                            <label>
                                Loading model files... (only run once)
                            </label>
                            {transcriber.progressItems.map((data) => (
                                <div key={data.file}>
                                    <Progress
                                        text={data.file}
                                        percentage={data.progress}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function SettingsTile(props: {
    icon: JSX.Element;
    className?: string;
    transcriber: Transcriber;
}) {
    const [showModal, setShowModal] = useState(false);

    const onClick = () => {
        setShowModal(true);
    };

    const onClose = () => {
        setShowModal(false);
    };

    return (
        <div className={props.className}>
            <Tile icon={props.icon} onClick={onClick} />
            <SettingsModal
                show={showModal}
                onClose={onClose}
                transcriber={props.transcriber}
            />
        </div>
    );
}

function SettingsModal(props: {
    show: boolean;
    onClose: () => void;
    transcriber: Transcriber;
}) {
    const names = Object.values(LANGUAGES).map(titleCase);

    const models = {
        // Original checkpoints
        'Xenova/whisper-tiny': [41, 152],
        'Xenova/whisper-base': [77, 291],
        'Xenova/whisper-small': [249],
        'Xenova/whisper-medium': [776],

        // Distil Whisper (English-only)
        'distil-whisper/distil-medium.en': [402],
        'distil-whisper/distil-large-v2': [767],
    };

    const updateSetting = (key: string, value: any) => {
        localStorage.setItem(`transcriber_${key}`, JSON.stringify(value));
    };

    return (
        <Modal
            show={props.show}
            title={"Settings"}
            content={
                <>
                    <label>Select the model to use.</label>
                    <select
                        className='mt-1 mb-1 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500'
                        defaultValue={props.transcriber.model}
                        onChange={(e) => {
                            props.transcriber.setModel(e.target.value);
                            updateSetting('model', e.target.value);
                        }}
                    >
                        {Object.keys(models)
                            .filter(
                                (key) =>
                                    props.transcriber.quantized ||
                                    // @ts-ignore
                                    models[key].length == 2,
                            )
                            .filter(
                                (key) => (
                                    !props.transcriber.multilingual || !key.startsWith('distil-whisper/')
                                )
                            )
                            .map((key) => (
                                <option key={key} value={key}>{`${key}${(props.transcriber.multilingual || key.startsWith('distil-whisper/')) ? "" : ".en"
                                    } (${
                                    // @ts-ignore
                                    models[key][
                                    props.transcriber.quantized ? 0 : 1
                                    ]
                                    }MB)`}</option>
                            ))}
                    </select>
                    <div className='flex justify-between items-center mb-3 px-1'>
                        <div className='flex'>
                            <input
                                id='multilingual'
                                type='checkbox'
                                checked={props.transcriber.multilingual}
                                onChange={(e) => {
                                    props.transcriber.setMultilingual(e.target.checked);
                                    updateSetting('multilingual', e.target.checked);
                                }}
                            ></input>
                            <label htmlFor={"multilingual"} className='ms-1'>
                                Multilingual
                            </label>
                        </div>
                        <div className='flex'>
                            <input
                                id='quantize'
                                type='checkbox'
                                checked={props.transcriber.quantized}
                                onChange={(e) => {
                                    props.transcriber.setQuantized(e.target.checked);
                                    updateSetting('quantized', e.target.checked);
                                }}
                            ></input>
                            <label htmlFor={"quantize"} className='ms-1'>
                                Quantized
                            </label>
                        </div>
                    </div>
                    {props.transcriber.multilingual && (
                        <>
                            <label>Select the source language.</label>
                            <select
                                className='mt-1 mb-3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500'
                                defaultValue={props.transcriber.language}
                                onChange={(e) => {
                                    props.transcriber.setLanguage(e.target.value);
                                    updateSetting('language', e.target.value);
                                }}
                            >
                                {Object.keys(LANGUAGES).map((key, i) => (
                                    <option key={key} value={key}>
                                        {names[i]}
                                    </option>
                                ))}
                            </select>
                            <label>Select the task to perform.</label>
                            <select
                                className='mt-1 mb-3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500'
                                defaultValue={props.transcriber.subtask}
                                onChange={(e) => {
                                    props.transcriber.setSubtask(e.target.value);
                                    updateSetting('subtask', e.target.value);
                                }}
                            >
                                <option value={"transcribe"}>Transcribe</option>
                                <option value={"translate"}>
                                    Translate (to English)
                                </option>
                            </select>
                        </>
                    )}
                </>
            }
            onClose={props.onClose}
            onSubmit={() => { }}
        />
    );
}

function VerticalBar() {
    return <div className='w-[1px] bg-slate-200'></div>;
}

function AudioDataBar(props: {
    progress: number;
    transcribedData?: TranscriberData;
    audioDuration: number;
}) {
    if (props.transcribedData?.isBusy && props.audioDuration && props.transcribedData.chunks.length > 0) {
        const lastTimestamp = props.transcribedData.chunks[props.transcribedData.chunks.length - 1].timestamp[0];
        const progress = Math.min(100, (lastTimestamp / props.audioDuration) * 100);
        return <ProgressBar progress={`${Math.round(progress)}%`} />;
    }

    return <ProgressBar progress={`${Math.round(props.progress * 100)}%`} />;
}

function ProgressBar(props: { progress: string }) {
    return (
        <div className='w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700'>
            <div
                className='bg-blue-600 h-1 rounded-full transition-all duration-100'
                style={{ width: props.progress }}
            ></div>
        </div>
    );
}

function UrlTile(props: {
    icon: JSX.Element;
    text: string;
    onUrlUpdate: (url: string) => void;
}) {
    const [showModal, setShowModal] = useState(false);

    const onClick = () => {
        setShowModal(true);
    };

    const onClose = () => {
        setShowModal(false);
    };

    const onSubmit = (url: string) => {
        props.onUrlUpdate(url);
        onClose();
    };

    return (
        <>
            <Tile icon={props.icon} text={props.text} onClick={onClick} />
            <UrlModal show={showModal} onSubmit={onSubmit} onClose={onClose} />
        </>
    );
}

function UrlModal(props: {
    show: boolean;
    onSubmit: (url: string) => void;
    onClose: () => void;
}) {
    const [url, setUrl] = useState(Constants.DEFAULT_AUDIO_URL);

    const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setUrl(event.target.value);
    };

    const onSubmit = () => {
        props.onSubmit(url);
    };

    return (
        <Modal
            show={props.show}
            title={"From URL"}
            content={
                <>
                    {"Enter the URL of the audio file you want to load."}
                    <UrlInput onChange={onChange} value={url} />
                </>
            }
            onClose={props.onClose}
            submitText={"Load"}
            onSubmit={onSubmit}
        />
    );
}

const SUPPORTED_FORMATS = {
    // Audio formats
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/x-m4a': '.m4a',
    'audio/aac': '.aac',
    'audio/webm': '.webm',
    'audio/x-ms-wma': '.wma',
    // Video formats
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/ogg': '.ogv',
    'video/quicktime': '.mov'
};

function FileTile(props: {
    icon: JSX.Element;
    text: string;
    onFileUpdate: (decoded: AudioBuffer, blobUrl: string, mimeType: string) => void;
}) {
    const [isConverting, setIsConverting] = useState(false);
    const [ffmpeg, setFFmpeg] = useState<any>(null);
    const [conversionProgress, setConversionProgress] = useState(0);

    // Create hidden input element
    let elem = document.createElement("input");
    elem.type = "file";
    elem.accept = Object.values(SUPPORTED_FORMATS).join(',');

    const loadFFmpeg = async () => {
        try {
            console.log('Loading FFmpeg...');
            const ffmpegModule = await import('@ffmpeg/ffmpeg');
            const { fetchFile } = await import('@ffmpeg/util');

            const ffmpegInstance = ffmpegModule.createFFmpeg({
                log: true,
                logger: ({ message }) => console.log(message),
                progress: ({ ratio }) => setConversionProgress(ratio)
            });

            await ffmpegInstance.load();
            setFFmpeg(ffmpegInstance);
            return { ffmpegInstance, fetchFile };
        } catch (error) {
            console.error('Failed to load FFmpeg:', error);
            if (error instanceof Error && error.toString().includes('SharedArrayBuffer')) {
                throw new Error('Browser security settings prevent audio conversion. Please try a different audio format or convert the file locally first.');
            }
            throw error;
        }
    };

    const handleWMAFile = async (file: File) => {
        console.log('Starting WMA conversion process...');
        setIsConverting(true);

        try {
            // Load FFmpeg if not already loaded
            const { ffmpegInstance, fetchFile } = ffmpeg ?
                { ffmpegInstance: ffmpeg, fetchFile: (await import('@ffmpeg/util')).fetchFile } :
                await loadFFmpeg();

            // Write the input file to FFmpeg's virtual filesystem
            const inputFileName = 'input.wma';
            const outputFileName = 'output.mp3';

            // Use FS API instead of writeFile
            ffmpegInstance.FS('writeFile', inputFileName, await fetchFile(file));

            // Run the conversion
            await ffmpegInstance.run('-i', inputFileName, '-acodec', 'libmp3lame', '-ab', '192k', outputFileName);

            // Read the output file using FS API
            const data = ffmpegInstance.FS('readFile', outputFileName);
            const mp3Blob = new Blob([data.buffer], { type: 'audio/mpeg' });
            console.log('Conversion successful, MP3 size:', mp3Blob.size);

            // Clean up files
            ffmpegInstance.FS('unlink', inputFileName);
            ffmpegInstance.FS('unlink', outputFileName);

            // Create URL and decode
            const urlObj = URL.createObjectURL(mp3Blob);
            const arrayBuffer = await mp3Blob.arrayBuffer();

            try {
                const audioCTX = new AudioContext({
                    sampleRate: Constants.SAMPLING_RATE,
                });

                const decoded = await audioCTX.decodeAudioData(arrayBuffer);
                console.log('Successfully decoded audio');
                props.onFileUpdate(decoded, urlObj, 'audio/mpeg');
            } catch (decodeError) {
                console.error('Audio decoding error:', decodeError);
                throw new Error('Failed to decode converted audio');
            }

        } catch (error) {
            console.error('Conversion error:', error);
            if (error instanceof Error && error.message.includes('security settings')) {
                alert(error.message);
            } else {
                alert('Failed to convert WMA file. Please try another format or convert it manually.');
            }
        } finally {
            setIsConverting(false);
        }
    };

    const extractAudioFromVideo = async (file: File) => {
        console.log('Starting video audio extraction...');
        setIsConverting(true);

        try {
            const { ffmpegInstance, fetchFile } = ffmpeg ?
                { ffmpegInstance: ffmpeg, fetchFile: (await import('@ffmpeg/util')).fetchFile } :
                await loadFFmpeg();

            const inputFileName = 'input_video' + file.name.substring(file.name.lastIndexOf('.'));
            const outputFileName = 'output.mp3';

            ffmpegInstance.FS('writeFile', inputFileName, await fetchFile(file));

            // Extract audio from video and convert to MP3
            await ffmpegInstance.run(
                '-i', inputFileName,
                '-vn', // Skip video
                '-acodec', 'libmp3lame',
                '-ab', '192k',
                '-ar', '44100',
                outputFileName
            );

            const data = ffmpegInstance.FS('readFile', outputFileName);
            const mp3Blob = new Blob([data.buffer], { type: 'audio/mpeg' });
            console.log('Audio extraction successful, MP3 size:', mp3Blob.size);

            // Clean up files
            ffmpegInstance.FS('unlink', inputFileName);
            ffmpegInstance.FS('unlink', outputFileName);

            const urlObj = URL.createObjectURL(mp3Blob);
            const arrayBuffer = await mp3Blob.arrayBuffer();

            const audioCTX = new AudioContext({
                sampleRate: Constants.SAMPLING_RATE,
            });

            const decoded = await audioCTX.decodeAudioData(arrayBuffer);
            console.log('Successfully decoded audio');
            props.onFileUpdate(decoded, urlObj, 'audio/mpeg');

        } catch (error) {
            console.error('Video processing error:', error);
            if (error instanceof Error && error.message.includes('security settings')) {
                alert(error.message);
            } else {
                alert('Failed to extract audio from video. Please try another format.');
            }
        } finally {
            setIsConverting(false);
        }
    };

    elem.onchange = async (event) => {
        console.log('File selected');
        let files = (event.target as HTMLInputElement).files;
        if (!files) {
            console.log('No files selected');
            return;
        }

        const file = files[0];
        console.log('Selected file:', {
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: new Date(file.lastModified).toISOString()
        });

        // Handle video files
        if (file.type.startsWith('video/')) {
            console.log('Video file detected, extracting audio...');
            await extractAudioFromVideo(file);
            elem.value = '';
            return;
        }

        // Handle WMA files
        if (file.type === 'audio/x-ms-wma' ||
            file.name.toLowerCase().endsWith('.wma')) {
            console.log('WMA file detected');
            await handleWMAFile(file);
            elem.value = '';
            return;
        }

        console.log('Processing as regular audio file...');
        // Handle other supported formats
        const urlObj = URL.createObjectURL(file);
        const mimeType = file.type;

        const reader = new FileReader();
        reader.addEventListener("load", async (e) => {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            if (!arrayBuffer) return;

            try {
                const audioCTX = new AudioContext({
                    sampleRate: Constants.SAMPLING_RATE,
                });

                const decoded = await audioCTX.decodeAudioData(arrayBuffer);
                props.onFileUpdate(decoded, urlObj, mimeType);
            } catch (error) {
                console.error('Audio decoding error:', error);
                alert('Failed to decode audio file. Please make sure it is a valid audio file.');
            }
        });
        reader.readAsArrayBuffer(file);
        elem.value = '';
    };

    return (
        <div className="relative">
            <Tile
                icon={props.icon}
                text={isConverting ? `Converting ${Math.round(conversionProgress * 100)}%` : props.text}
                onClick={() => !isConverting && elem.click()}
            />
            {isConverting && (
                <div className="absolute -bottom-1 left-0 right-0 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-blue-600 transition-all duration-200"
                        style={{ width: `${Math.round(conversionProgress * 100)}%` }}
                    />
                </div>
            )}
        </div>
    );
}

function RecordTile(props: {
    icon: JSX.Element;
    text: string;
    setAudioData: (data: Blob) => void;
}) {
    const [showModal, setShowModal] = useState(false);

    const onClick = () => {
        setShowModal(true);
    };

    const onClose = () => {
        setShowModal(false);
    };

    const onSubmit = (data: Blob | undefined) => {
        if (data) {
            props.setAudioData(data);
            onClose();
        }
    };

    return (
        <>
            <Tile icon={props.icon} text={props.text} onClick={onClick} />
            <RecordModal
                show={showModal}
                onSubmit={onSubmit}
                onClose={onClose}
            />
        </>
    );
}

function RecordModal(props: {
    show: boolean;
    onSubmit: (data: Blob | undefined) => void;
    onClose: () => void;
}) {
    const [audioBlob, setAudioBlob] = useState<Blob>();

    const onRecordingComplete = (blob: Blob) => {
        setAudioBlob(blob);
    };

    const onSubmit = () => {
        props.onSubmit(audioBlob);
        setAudioBlob(undefined);
    };

    const onClose = () => {
        props.onClose();
        setAudioBlob(undefined);
    };

    return (
        <Modal
            show={props.show}
            title={"From Recording"}
            content={
                <>
                    {"Record audio using your microphone"}
                    <AudioRecorder onRecordingComplete={onRecordingComplete} />
                </>
            }
            onClose={onClose}
            submitText={"Load"}
            submitEnabled={audioBlob !== undefined}
            onSubmit={onSubmit}
        />
    );
}

function Tile(props: {
    icon: JSX.Element;
    text?: string;
    onClick?: () => void;
}) {
    return (
        <button
            onClick={props.onClick}
            className='flex items-center justify-center rounded-lg p-2 bg-blue text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-200'
        >
            <div className='w-7 h-7'>{props.icon}</div>
            {props.text && (
                <div className='ml-2 break-text text-center text-md w-30'>
                    {props.text}
                </div>
            )}
        </button>
    );
}

function AnchorIcon() {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth='1.5'
            stroke='currentColor'
        >
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244'
            />
        </svg>
    );
}

function FolderIcon() {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth='1.5'
            stroke='currentColor'
        >
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776'
            />
        </svg>
    );
}

function SettingsIcon() {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth='1.25'
            stroke='currentColor'
        >
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z'
            />
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
            />
        </svg>
    );
}

function MicrophoneIcon() {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth={1.5}
            stroke='currentColor'
        >
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z'
            />
        </svg>
    );
}

import { useCallback, useMemo, useState } from "react";
import { useWorker } from "./useWorker";
import Constants from "../utils/Constants";

interface ProgressItem {
    file: string;
    loaded: number;
    progress: number;
    total: number;
    name: string;
    status: string;
}

interface TranscriberUpdateData {
    data: [
        string,
        { chunks: { text: string; timestamp: [number, number | null] }[] },
    ];
    text: string;
}

interface TranscriberCompleteData {
    data: {
        text: string;
        chunks: { text: string; timestamp: [number, number | null] }[];
    };
}

export interface TranscriberChunk {
    text: string;
    timestamp: [number, number | null];
    isEdited?: boolean;
}

export interface TranscriberData {
    chunks: TranscriberChunk[];
    text: string;
    isBusy: boolean;
    isModelLoading: boolean;
    error?: string;
}

export interface Transcriber {
    onInputChange: () => void;
    isBusy: boolean;
    isModelLoading: boolean;
    progressItems: ProgressItem[];
    start: (audioData: AudioBuffer | undefined) => void;
    output?: TranscriberData;
    model: string;
    setModel: (model: string) => void;
    multilingual: boolean;
    setMultilingual: (model: boolean) => void;
    quantized: boolean;
    setQuantized: (model: boolean) => void;
    subtask: string;
    setSubtask: (subtask: string) => void;
    language?: string;
    setLanguage: (language: string) => void;
    seek?: (time: number) => void;
    setAudioElement: (element: HTMLAudioElement | null) => void;
}

function getStoredSetting<T>(key: string, defaultValue: T): T {
    const stored = localStorage.getItem(`transcriber_${key}`);
    if (stored !== null) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            return defaultValue;
        }
    }
    return defaultValue;
}

export function useTranscriber(): Transcriber {
    const [transcript, setTranscript] = useState<TranscriberData | undefined>(() => ({
        chunks: [],
        text: '',
        isBusy: false,
        isModelLoading: false,
        error: undefined
    }));
    const [isBusy, setIsBusy] = useState(false);
    const [isModelLoading, setIsModelLoading] = useState(false);

    const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);

    const webWorker = useWorker((event) => {
        const message = event.data;
        // Update the state with the result
        switch (message.status) {
            case "progress":
                // Model file progress: update one of the progress items.
                setProgressItems((prev) =>
                    prev.map((item) => {
                        if (item.file === message.file) {
                            return { ...item, progress: message.progress };
                        }
                        return item;
                    }),
                );
                break;
            case "update":
                // Received partial update
                const updateMessage = message as TranscriberUpdateData;
                setTranscript(prevTranscript => ({
                    isBusy: true,
                    isModelLoading: false,
                    text: updateMessage.data[0],
                    chunks: updateMessage.data[1].chunks.map((chunk, i) => ({
                        text: chunk.text,
                        timestamp: chunk.timestamp,
                        isEdited: prevTranscript?.chunks[i]?.isEdited || false
                    }))
                }));
                break;
            case "complete":
                // Received complete transcript
                const completeMessage = message as TranscriberCompleteData;
                setTranscript(prevTranscript => ({
                    isBusy: false,
                    isModelLoading: false,
                    text: completeMessage.data.text,
                    chunks: completeMessage.data.chunks.map((chunk, i) => ({
                        text: chunk.text,
                        timestamp: chunk.timestamp,
                        isEdited: prevTranscript?.chunks[i]?.isEdited || false
                    }))
                }));
                setIsBusy(false);
                break;

            case "initiate":
                // Model file start load: add a new progress item to the list.
                setIsModelLoading(true);
                setProgressItems((prev) => [...prev, message]);
                break;
            case "ready":
                setIsModelLoading(false);
                break;
            case "error":
                setIsBusy(false);
                setTranscript(prev => ({
                    ...(prev || { chunks: [], text: '' }),
                    isBusy: false,
                    isModelLoading: false,
                    error: `${message.data.message} This is most likely because you are using Safari on an M1/M2 Mac. Please try again from Chrome, Firefox, or Edge.\n\nIf this is not the case, please file a bug report.`
                }));
                break;
            case "done":
                // Model file loaded: remove the progress item from the list.
                setProgressItems((prev) =>
                    prev.filter((item) => item.file !== message.file),
                );
                break;

            default:
                // initiate/download/done
                break;
        }
    });

    const [model, setModel] = useState<string>(
        getStoredSetting('model', Constants.DEFAULT_MODEL)
    );
    const [subtask, setSubtask] = useState<string>(
        getStoredSetting('subtask', Constants.DEFAULT_SUBTASK)
    );
    const [quantized, setQuantized] = useState<boolean>(
        getStoredSetting('quantized', Constants.DEFAULT_QUANTIZED)
    );
    const [multilingual, setMultilingual] = useState<boolean>(
        getStoredSetting('multilingual', Constants.DEFAULT_MULTILINGUAL)
    );
    const [language, setLanguage] = useState<string>(
        getStoredSetting('language', Constants.DEFAULT_LANGUAGE)
    );

    const onInputChange = useCallback(() => {
        setTranscript({
            chunks: [],
            text: '',
            isBusy: false,
            isModelLoading: false,
            error: undefined
        });
    }, []);

    const postRequest = useCallback(
        async (audioData: AudioBuffer | undefined) => {
            if (audioData) {
                setTranscript(undefined);
                setIsBusy(true);

                let audio;
                if (audioData.numberOfChannels === 2) {
                    const SCALING_FACTOR = Math.sqrt(2);

                    let left = audioData.getChannelData(0);
                    let right = audioData.getChannelData(1);

                    audio = new Float32Array(left.length);
                    for (let i = 0; i < audioData.length; ++i) {
                        audio[i] = SCALING_FACTOR * (left[i] + right[i]) / 2;
                    }
                } else {
                    // If the audio is not stereo, we can just use the first channel:
                    audio = audioData.getChannelData(0);
                }

                webWorker.postMessage({
                    audio,
                    model,
                    multilingual,
                    quantized,
                    subtask: multilingual ? subtask : null,
                    language:
                        multilingual && language !== "auto" ? language : null,
                });
            }
        },
        [webWorker, model, multilingual, quantized, subtask, language],
    );

    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

    const seek = useCallback((time: number) => {
        if (audioElement) {
            audioElement.currentTime = time;
            audioElement.play();
        }
    }, [audioElement]);

    const transcriber = useMemo(() => {
        return {
            onInputChange,
            isBusy,
            isModelLoading,
            progressItems,
            start: postRequest,
            output: transcript,
            model,
            setModel,
            multilingual,
            setMultilingual,
            quantized,
            setQuantized,
            subtask,
            setSubtask,
            language,
            setLanguage,
            seek,
            setAudioElement,
        };
    }, [
        isBusy,
        isModelLoading,
        progressItems,
        postRequest,
        transcript,
        model,
        multilingual,
        quantized,
        subtask,
        language,
        seek,
    ]);

    return transcriber;
}

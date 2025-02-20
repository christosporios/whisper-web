import { useRef, useEffect, useState } from "react";
import { Document, Paragraph, TextRun, Packer } from 'docx';

import { TranscriberData, TranscriberChunk } from "../hooks/useTranscriber";
import { formatAudioTimestamp } from "../utils/AudioUtils";
import { Help } from "./Help";

interface Props {
    transcribedData: TranscriberData | undefined;
    onSeek?: (time: number) => void;
}

export default function Transcript({ transcribedData, onSeek }: Props) {
    const [currentTime, setCurrentTime] = useState(0);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editText, setEditText] = useState("");
    const divRef = useRef<HTMLDivElement>(null);
    const editRef = useRef<HTMLTextAreaElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [audioDuration, setAudioDuration] = useState(0);

    const saveBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };
    const exportTXT = () => {
        let chunks = transcribedData?.chunks ?? [];
        let text = chunks
            .map((chunk) => chunk.text)
            .join(" ")  // Add space between chunks
            .trim();

        const blob = new Blob([text], { type: "text/plain" });
        saveBlob(blob, "transcript.txt");
    };
    const exportJSON = () => {
        let jsonData = JSON.stringify(transcribedData?.chunks ?? [], null, 2);

        // post-process the JSON to make it more readable
        const regex = /(    "timestamp": )\[\s+(\S+)\s+(\S+)\s+\]/gm;
        jsonData = jsonData.replace(regex, "$1[$2 $3]");

        const blob = new Blob([jsonData], { type: "application/json" });
        saveBlob(blob, "transcript.json");
    };
    const exportDOCX = () => {
        if (!transcribedData?.chunks) return;

        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: transcribedData.chunks
                                    .map(chunk => chunk.text)
                                    .join(" ")
                                    .trim()
                            })
                        ]
                    })
                ]
            }]
        });

        Packer.toBlob(doc).then(blob => {
            saveBlob(blob, "transcript.docx");
        });
    };

    // Scroll to the bottom when the component updates
    useEffect(() => {
        if (divRef.current) {
            const diff = Math.abs(
                divRef.current.offsetHeight +
                divRef.current.scrollTop -
                divRef.current.scrollHeight,
            );

            if (diff <= 64) {
                // We're close enough to the bottom, so scroll to the bottom
                divRef.current.scrollTop = divRef.current.scrollHeight;
            }
        }
    });

    const handleTimeUpdate = (time: number) => {
        setCurrentTime(time);
    };

    // Connect to audio element time updates
    useEffect(() => {
        const audio = document.querySelector("audio");
        if (audio) {
            audioRef.current = audio;
            audio.playbackRate = playbackSpeed;

            // Set initial values
            setCurrentTime(audio.currentTime);
            setAudioDuration(audio.duration || 0);

            const updateTime = () => handleTimeUpdate(audio.currentTime);
            const updateDuration = () => {
                setAudioDuration(audio.duration);
                setCurrentTime(audio.currentTime);
            };

            audio.addEventListener("timeupdate", updateTime);
            audio.addEventListener("loadedmetadata", updateDuration);
            audio.addEventListener("seeking", updateTime);

            return () => {
                audio.removeEventListener("timeupdate", updateTime);
                audio.removeEventListener("loadedmetadata", updateDuration);
                audio.removeEventListener("seeking", updateTime);
            };
        }
    }, [playbackSpeed]);

    const handleUtteranceClick = (timestamp: number) => {
        if (onSeek) {
            onSeek(timestamp);
            setCurrentTime(timestamp);
        }
    };

    const getCurrentUtteranceIndex = () => {
        if (!transcribedData?.chunks?.length) return -1;

        // Special case: if we're transcribing, the last chunk is the current one
        if (transcribedData.isBusy) {
            const lastIndex = transcribedData.chunks.length - 1;
            const lastChunk = transcribedData.chunks[lastIndex];
            if (currentTime >= lastChunk.timestamp[0]) {
                return lastIndex;
            }
        }

        // Find the chunk that contains the current time
        for (let i = 0; i < transcribedData.chunks.length; i++) {
            const chunk = transcribedData.chunks[i];
            const start = chunk.timestamp[0];
            const end = chunk.timestamp[1] ??
                // If this is the last chunk and we're not transcribing, 
                // use the next chunk's start or audio duration
                (i < transcribedData.chunks.length - 1 ?
                    transcribedData.chunks[i + 1].timestamp[0] :
                    audioDuration);

            if (currentTime >= start && currentTime < end) {
                return i;
            }
        }
        return -1;
    };

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
        // Don't handle keyboard events when editing
        if (editingIndex !== null) return;

        // Don't handle if typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        if (!transcribedData?.chunks?.length) return;

        const currentIndex = getCurrentUtteranceIndex();
        if (currentIndex === -1) return;

        switch (e.key) {
            case " ": // Space bar
                e.preventDefault();
                if (audioRef.current) {
                    if (audioRef.current.paused) {
                        audioRef.current.play();
                    } else {
                        audioRef.current.pause();
                    }
                }
                break;
            case "ArrowRight":
                if (currentIndex < transcribedData.chunks.length - 1) {
                    onSeek?.(transcribedData.chunks[currentIndex + 1].timestamp[0]);
                }
                break;
            case "ArrowLeft":
                if (currentIndex > 0) {
                    onSeek?.(transcribedData.chunks[currentIndex - 1].timestamp[0]);
                }
                break;
            case "Enter":
                if (!editingIndex) {
                    e.preventDefault();
                    setEditingIndex(currentIndex);
                    setEditText(transcribedData.chunks[currentIndex].text);
                    setTimeout(() => editRef.current?.focus(), 0);
                }
                break;
            case "Escape":
                if (editingIndex !== null) {
                    setEditingIndex(null);
                }
                break;
            case "ArrowUp":
                e.preventDefault();
                if (audioRef.current) {
                    const newSpeed = Math.min(4, playbackSpeed + 0.25);
                    audioRef.current.playbackRate = newSpeed;
                    setPlaybackSpeed(newSpeed);
                }
                break;
            case "ArrowDown":
                e.preventDefault();
                if (audioRef.current) {
                    const newSpeed = Math.max(0.25, playbackSpeed - 0.25);
                    audioRef.current.playbackRate = newSpeed;
                    setPlaybackSpeed(newSpeed);
                }
                break;
        }
    };

    const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            if (editingIndex !== null && transcribedData?.chunks) {
                // Create a new chunks array with the edited text
                const newChunks = [...transcribedData.chunks];
                newChunks[editingIndex] = {
                    ...newChunks[editingIndex],
                    text: editText,
                    isEdited: true
                };

                // Update the transcriber data
                Object.assign(transcribedData, {
                    ...transcribedData,
                    chunks: newChunks,
                    text: newChunks.map(chunk => chunk.text).join('')
                });
                setEditingIndex(null);
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setEditingIndex(null);
        }
    };

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [transcribedData, currentTime, editingIndex]);

    return (
        <div className='mt-8'>
            <div className='flex items-center justify-between mb-2'>
                <div className='flex items-center gap-4'>
                    {/* Add loading state indicator */}
                    {transcribedData?.isModelLoading && (
                        <div className='flex items-center gap-2 text-sm text-slate-600'>
                            <div className='w-32 h-2 bg-slate-200 rounded-full overflow-hidden'>
                                <div
                                    className='h-full bg-blue-500 rounded-full animate-pulse'
                                />
                            </div>
                            <span>Loading model files...</span>
                        </div>
                    )}

                    {/* Add error state display */}
                    {transcribedData?.error && (
                        <div className='text-red-500'>
                            Error: {transcribedData.error}
                        </div>
                    )}

                    {transcribedData && !transcribedData.isBusy && !transcribedData.isModelLoading && (
                        <>
                            <button
                                onClick={exportTXT}
                                className='text-white bg-green-500 hover:bg-green-600 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-4 py-2 text-center dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800 inline-flex items-center'
                            >
                                Export TXT
                            </button>
                            <button
                                onClick={exportJSON}
                                className='text-white bg-green-500 hover:bg-green-600 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-4 py-2 text-center dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800 inline-flex items-center'
                            >
                                Export JSON
                            </button>
                            <button
                                onClick={exportDOCX}
                                className='text-white bg-green-500 hover:bg-green-600 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-4 py-2 text-center dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800 inline-flex items-center'
                            >
                                Export DOCX
                            </button>
                        </>
                    )}
                    {transcribedData?.isBusy && (
                        <div className='flex items-center gap-2 text-sm text-slate-600'>
                            <div className='w-32 h-2 bg-slate-200 rounded-full overflow-hidden'>
                                <div
                                    className='h-full bg-blue-500 rounded-full transition-all duration-200'
                                    style={{
                                        width: `${audioDuration && transcribedData.chunks.length > 0
                                            ? Math.min(100, (transcribedData.chunks[transcribedData.chunks.length - 1].timestamp[0] / audioDuration) * 100)
                                            : 0}%`
                                    }}
                                />
                            </div>
                            <span>Transcribing...</span>
                        </div>
                    )}
                </div>
                <div className='flex items-center gap-4'>
                    <span className='text-sm text-slate-600 font-medium'>
                        Speed: {playbackSpeed.toFixed(2)}x
                    </span>
                    <Help />
                </div>
            </div>
            <div className='bg-white rounded-lg p-8 shadow-xl shadow-black/5 ring-1 ring-slate-700/10'>
                <div className='prose max-w-none text-lg'>
                    {transcribedData?.chunks &&
                        transcribedData.chunks.map((chunk, i) => {
                            const start = chunk.timestamp[0];
                            const end = i < transcribedData.chunks.length - 1
                                ? transcribedData.chunks[i + 1].timestamp[0]
                                : (chunk.timestamp[1] || audioDuration);

                            const isPlaying = currentTime >= start && currentTime < end;
                            const isEditing = i === editingIndex;

                            if (isEditing) {
                                return (
                                    <textarea
                                        key={`${i}-edit`}
                                        ref={editRef}
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        onKeyDown={handleEditKeyDown}
                                        className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        rows={Math.max(1, editText.split('\n').length)}
                                    />
                                );
                            }

                            return (
                                <span
                                    key={`${i}-${chunk.text}`}
                                    onClick={() => handleUtteranceClick(chunk.timestamp[0])}
                                    className={`cursor-pointer transition-colors duration-200 
                                        ${isPlaying ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-slate-100'}
                                        ${chunk.isEdited ? 'text-green-600 underline decoration-green-600 underline-offset-4' : ''}`}
                                    title={formatAudioTimestamp(chunk.timestamp[0])}
                                >
                                    {chunk.text}{' '}
                                </span>
                            );
                        })}
                </div>
            </div>
        </div>
    );
}

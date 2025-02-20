import { AudioManager } from "./components/AudioManager";
import Transcript from "./components/Transcript";
import { useTranscriber } from "./hooks/useTranscriber";

function App() {
    const transcriber = useTranscriber();

    const handleSeek = (time: number) => {
        // This will need to be implemented in AudioManager
        transcriber.seek?.(time);
    };

    return (
        <div className='min-h-screen bg-slate-50'>
            <div className='container max-w-6xl mx-auto px-4 py-8'>
                <h1 className='text-5xl font-extrabold tracking-tight text-slate-900 sm:text-7xl text-center'>
                    Whisper Web
                </h1>
                <h2 className='mt-3 mb-8 px-4 text-center text-1xl font-semibold tracking-tight text-slate-900 sm:text-2xl'>
                    ML-powered speech recognition directly in your browser
                </h2>
                <AudioManager transcriber={transcriber} />
                <Transcript
                    transcribedData={transcriber.output}
                    onSeek={handleSeek}
                />
            </div>

            <div className='fixed bottom-4 left-1/2 -translate-x-1/2'>
                Made with{" "}
                <a
                    className='underline'
                    href='https://github.com/xenova/transformers.js'
                >
                    🤗 Transformers.js
                </a>
            </div>
        </div>
    );
}

export default App;

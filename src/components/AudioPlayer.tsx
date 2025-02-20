import { forwardRef } from 'react';

interface Props {
    audioUrl: string;
    mimeType: string;
}

const AudioPlayer = forwardRef<HTMLAudioElement, Props>(
    ({ audioUrl, mimeType }, ref) => {
        return (
            <audio
                ref={ref}
                controls
                className='w-full max-w-2xl'
                src={audioUrl}
            />
        );
    }
);

export default AudioPlayer;

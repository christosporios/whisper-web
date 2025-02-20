declare module 'light-audio-converter' {
    interface ConversionResult {
        name: string;
        format: string;
        data: string | ArrayBuffer;
        contentType: string;
    }

    export function convertAndSaveAudio(
        file: File,
        format: string,
        outputName: string
    ): Promise<ConversionResult>;
} 
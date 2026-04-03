import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for Whisper WebGPU transcription
 */
export function useTranscriber() {
    const [transcript, setTranscript] = useState(null);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isModelLoading, setIsModelLoading] = useState(false);
    const [progress, setProgress] = useState([]);
    const [error, setError] = useState(null);

    const workerRef = useRef(null);

    // Initialize worker
    useEffect(() => {
        workerRef.current = new Worker(
            new URL('../workers/transcription.worker.js', import.meta.url),
            { type: 'module' }
        );

        workerRef.current.onmessage = (event) => {
            const message = event.data;

            switch (message.status) {
                case 'initiate':
                    setIsModelLoading(true);
                    setProgress((prev) => [...prev, message]);
                    break;

                case 'progress':
                    setProgress((prev) =>
                        prev.map((item) =>
                            item.file === message.file
                                ? { ...item, progress: message.progress }
                                : item
                        )
                    );
                    break;

                case 'done':
                    setProgress((prev) =>
                        prev.filter((item) => item.file !== message.file)
                    );
                    break;

                case 'ready':
                    setIsModelLoading(false);
                    break;

                case 'update':
                    setTranscript({
                        text: message.data.text,
                        chunks: message.data.chunks,
                        tps: message.data.tps,
                        isBusy: true,
                    });
                    break;

                case 'complete':
                    setTranscript({
                        text: message.data.text,
                        chunks: message.data.chunks,
                        tps: message.data.tps,
                        isBusy: false,
                    });
                    setIsTranscribing(false);
                    break;

                case 'error':
                    setError(message.data.message);
                    setIsTranscribing(false);
                    break;
            }
        };

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
            }
        };
    }, []);

    /**
     * Transcribe audio data
     * @param {Float32Array} audioData - Audio samples at 16kHz
     * @param {string} language - Language code (optional)
     */
    const transcribe = useCallback((audioData, language = null) => {
        if (!workerRef.current) return;

        setTranscript(null);
        setError(null);
        setIsTranscribing(true);

        workerRef.current.postMessage({
            audio: audioData,
            language,
            task: 'transcribe',
        });
    }, []);

    /**
     * Clear the current transcript
     */
    const clear = useCallback(() => {
        setTranscript(null);
        setError(null);
    }, []);

    return {
        transcript,
        isTranscribing,
        isModelLoading,
        progress,
        error,
        transcribe,
        clear,
    };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import webSpeechTranscription from '../services/web-speech-api';

/**
 * Custom hook for Whisper WebGPU transcription with optional Web Speech API fallback
 */
export function useTranscriber() {
    const [transcript, setTranscript] = useState(null);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isModelLoading, setIsModelLoading] = useState(false);
    const [progress, setProgress] = useState([]);
    const [error, setError] = useState(null);
    const [transcriptionMethod, setTranscriptionMethod] = useState(null); // 'whisper' or 'webspeech'

    const workerRef = useRef(null);
    const webSpeechActiveRef = useRef(false);

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
                    setTranscriptionMethod('whisper');
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
                    console.error('[useTranscriber] Whisper error:', message.data.message);
                    setError(message.data.message);
                    setIsTranscribing(false);
                    setIsModelLoading(false);
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
     * Transcribe using Web Speech API directly (manual fallback)
     * @param {string} language - Language code
     */
    const transcribeWithWebSpeech = useCallback(async (language = 'en-US') => {
        if (webSpeechActiveRef.current) return;
        
        webSpeechActiveRef.current = true;
        setTranscriptionMethod('webspeech');
        
        try {
            console.log('[useTranscriber] Using Web Speech API...');
            
            setIsTranscribing(true);
            
            const result = await webSpeechTranscription.transcribe(null, language);
            
            setTranscript({
                text: result.text,
                chunks: [{ text: result.text, timestamp: [0, 0], finalised: true }],
                tps: 0,
                isBusy: false,
            });
            
            setIsTranscribing(false);
            webSpeechActiveRef.current = false;
        } catch (err) {
            console.error('[useTranscriber] Web Speech API error:', err);
            setError(err.message);
            setIsTranscribing(false);
            webSpeechActiveRef.current = false;
        }
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

    /**
     * Reset transcription method to try Whisper again
     */
    const resetMethod = useCallback(() => {
        setTranscriptionMethod(null);
        setError(null);
    }, []);

    return {
        transcript,
        isTranscribing,
        isModelLoading,
        progress,
        error,
        transcriptionMethod,
        transcribe,
        clear,
        resetMethod,
        transcribeWithWebSpeech,
        webSpeechSupported: webSpeechTranscription.isSupported,
    };
}

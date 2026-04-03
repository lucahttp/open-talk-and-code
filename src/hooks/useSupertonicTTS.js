import { useState, useEffect, useRef, useCallback } from 'react';
import { SupertonicTTS } from '../services/SupertonicTTS';

/**
 * React hook for Supertonic TTS
 * Uses the same ONNX pattern as HeyBuddy - global window.ort from CDN
 */
export function useSupertonicTTS(enabled = true) {
    const [isLoading, setIsLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(null);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const ttsRef = useRef(null);
    const audioCtxRef = useRef(null);
    const scheduledSourcesRef = useRef([]);
    const nextScheduledTimeRef = useRef(0);

    useEffect(() => {
        if (!enabled) return;

        // Initialize Audio Context
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Initialize TTS engine
        if (!ttsRef.current) {
            console.log("[useSupertonicTTS] Creating SupertonicTTS instance...");

            ttsRef.current = new SupertonicTTS({
                debug: true,
                basePath: `${import.meta.env.BASE_URL}supertonic`,
            });

            // Set up callbacks
            ttsRef.current.onProgress(({ message, percent }) => {
                console.log(`[useSupertonicTTS] Progress: ${message} (${percent}%)`);
                setProgress({ message, percent });
            });

            ttsRef.current.onReady(() => {
                console.log("[useSupertonicTTS] TTS Ready!");
                setIsLoading(false);
                setIsLoaded(true);
                setError(null);
            });

            ttsRef.current.onError((err) => {
                console.error("[useSupertonicTTS] TTS Error:", err);
                setError(err);
                setIsLoading(false);
            });

            // Start initialization
            setIsLoading(true);
            ttsRef.current.initialize().catch((err) => {
                console.error("[useSupertonicTTS] Initialize failed:", err);
                setError(err.message);
                setIsLoading(false);
            });
        }

        return () => {
            // Cleanup scheduled sources on unmount
            scheduledSourcesRef.current.forEach(source => {
                try { source.stop(); } catch (e) { /* Already stopped */ }
            });
            scheduledSourcesRef.current = [];
        };
    }, [enabled]);

    // Non-streaming speak (original)
    const speak = useCallback(async (text) => {
        if (!ttsRef.current || !isLoaded) {
            console.warn("[useSupertonicTTS] TTS not ready");
            return;
        }

        try {
            console.log("[useSupertonicTTS] Generating speech...");
            const { audio, sampleRate } = await ttsRef.current.generate(text);

            if (audioCtxRef.current && audio && audio.length > 0) {
                if (audioCtxRef.current.state === 'suspended') {
                    await audioCtxRef.current.resume();
                }

                const audioBuffer = audioCtxRef.current.createBuffer(1, audio.length, sampleRate);
                audioBuffer.getChannelData(0).set(audio);

                const source = audioCtxRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioCtxRef.current.destination);
                source.start();

                console.log("[useSupertonicTTS] Playing audio...");
            }
        } catch (err) {
            console.error("[useSupertonicTTS] Speak error:", err);
            setError(err.message);
        }
    }, [isLoaded]);

    /**
     * Streaming speak - starts audio playback as soon as first chunk is ready
     * @param {string} text - Text to speak
     * @param {Function} onProgress - Optional callback (chunkIndex, totalChunks)
     */
    const speakStreaming = useCallback(async (text, onProgress) => {
        if (!ttsRef.current || !isLoaded) {
            console.warn("[useSupertonicTTS] TTS not ready");
            return;
        }

        const audioCtx = audioCtxRef.current;
        if (!audioCtx) return;

        // Resume audio context if suspended
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        // Stop any currently playing audio
        scheduledSourcesRef.current.forEach(source => {
            try { source.stop(); } catch (e) { /* Already stopped */ }
        });
        scheduledSourcesRef.current = [];

        setIsSpeaking(true);
        nextScheduledTimeRef.current = audioCtx.currentTime;

        const SILENCE_BETWEEN_CHUNKS = 0.3; // 300ms silence between chunks

        try {
            await ttsRef.current.generateStreaming(text, null, (audio, sampleRate, chunkIndex, totalChunks, chunkDuration) => {
                console.log(`[useSupertonicTTS] Chunk ${chunkIndex + 1}/${totalChunks} ready (${chunkDuration.toFixed(2)}s)`);

                // Create audio buffer
                const audioBuffer = audioCtx.createBuffer(1, audio.length, sampleRate);
                audioBuffer.getChannelData(0).set(audio);

                // Create source and schedule it
                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioCtx.destination);

                // Schedule this chunk to play after previous chunks
                const startTime = Math.max(nextScheduledTimeRef.current, audioCtx.currentTime);
                source.start(startTime);
                scheduledSourcesRef.current.push(source);

                // Update next scheduled time (add chunk duration + silence)
                nextScheduledTimeRef.current = startTime + audioBuffer.duration;
                if (chunkIndex < totalChunks - 1) {
                    nextScheduledTimeRef.current += SILENCE_BETWEEN_CHUNKS;
                }

                // Call progress callback
                if (onProgress) {
                    onProgress(chunkIndex + 1, totalChunks);
                }

                // Mark speaking as done when last chunk finishes
                if (chunkIndex === totalChunks - 1) {
                    source.onended = () => {
                        setIsSpeaking(false);
                    };
                }
            });
        } catch (err) {
            console.error("[useSupertonicTTS] Streaming speak error:", err);
            setError(err.message);
            setIsSpeaking(false);
        }
    }, [isLoaded]);

    // Stop all currently playing audio
    const stop = useCallback(() => {
        scheduledSourcesRef.current.forEach(source => {
            try { source.stop(); } catch (e) { /* Already stopped */ }
        });
        scheduledSourcesRef.current = [];
        setIsSpeaking(false);
    }, []);

    return {
        speak,
        speakStreaming,
        stop,
        isLoading,
        isLoaded,
        isSpeaking,
        error,
        progress,
    };
}

export default useSupertonicTTS;

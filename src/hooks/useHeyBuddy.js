import { useState, useEffect, useCallback, useRef } from 'react';
import { HeyBuddy } from '@/services/HeyBuddy';

const initialState = {
    isInitialized: false,
    isListening: false,
    isRecording: false,
    isSpeaking: false,
    speechProbability: 0,
    wakeWords: {},
    recording: null,
    rawAudioSamples: null,
    frameTimeEma: 0,
    permissionStatus: 'prompt', // 'prompt' | 'granted' | 'denied'
    error: null,
};

/**
 * Converts floating-point audio samples to a Wave blob.
 */
function samplesToBlob(audioSamples, sampleRate = 16000, numChannels = 1) {
    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    const floatTo16BitPCM = (output, offset, input) => {
        for (let i = 0; i < input.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
    };

    const byteRate = sampleRate * numChannels * 2;
    const blockAlign = numChannels * 2;
    const wavHeaderSize = 44;
    const dataLength = audioSamples.length * numChannels * 2;
    const buffer = new ArrayBuffer(wavHeaderSize + dataLength);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    floatTo16BitPCM(view, wavHeaderSize, audioSamples);

    return new Blob([view], { type: 'audio/wav' });
}

/**
 * Custom hook for HeyBuddy wake word detection
 * @param {Object} options - HeyBuddy configuration options
 * @param {Function} onRecordingComplete - Callback with raw audio samples when recording ends
 */
export function useHeyBuddy(options = {}, onRecordingComplete = null) {
    const [state, setState] = useState(initialState);
    const heyBuddyRef = useRef(null);
    const onRecordingCompleteRef = useRef(onRecordingComplete);

    // Keep callback ref updated
    useEffect(() => {
        onRecordingCompleteRef.current = onRecordingComplete;
    }, [onRecordingComplete]);

    const updateState = useCallback((updates) => {
        setState((prev) => ({ ...prev, ...updates }));
    }, []);

    const requestMicrophonePermission = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
            updateState({ permissionStatus: 'granted' });
            return true;
        } catch (error) {
            updateState({ permissionStatus: 'denied', error: error.message });
            return false;
        }
    }, [updateState]);

    const start = useCallback(async () => {
        if (heyBuddyRef.current) {
            try {
                await heyBuddyRef.current.start();
                updateState({ isInitialized: true, error: null });
            } catch (error) {
                updateState({ error: error.message });
            }
        }
    }, [updateState]);

    const stop = useCallback(() => {
        if (heyBuddyRef.current) {
            heyBuddyRef.current.stop();
            updateState({ isInitialized: false, isListening: false });
        }
    }, [updateState]);

    const pause = useCallback(() => {
        if (heyBuddyRef.current) {
            heyBuddyRef.current.pause();
        }
    }, []);

    const resume = useCallback(() => {
        if (heyBuddyRef.current) {
            heyBuddyRef.current.resume();
        }
    }, []);

    useEffect(() => {
        // Initialize HeyBuddy instance
        const heyBuddy = new HeyBuddy(options);
        heyBuddyRef.current = heyBuddy;

        // Register callbacks
        heyBuddy.onProcessed((result) => {
            updateState({
                isListening: result.listening,
                isRecording: result.recording,
                isSpeaking: result.speech.active,
                speechProbability: result.speech.probability,
                wakeWords: result.wakeWords,
                frameTimeEma: heyBuddy.frameTimeEma,
            });
        });

        heyBuddy.onRecording((audioSamples) => {
            // Create blob URL for playback
            const blob = samplesToBlob(audioSamples);
            const url = URL.createObjectURL(blob);

            // Store raw samples for transcription
            updateState({
                recording: url,
                rawAudioSamples: audioSamples,
            });

            // Call transcription callback if provided
            if (onRecordingCompleteRef.current) {
                onRecordingCompleteRef.current(audioSamples);
            }
        });

        // Cleanup
        return () => {
            heyBuddy.stop();
        };
    }, [options, updateState]);

    return {
        ...state,
        start,
        stop,
        pause,
        resume,
        requestMicrophonePermission,
    };
}

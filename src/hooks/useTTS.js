import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Custom hook for Browser-native Text-to-Speech
 */
export function useTTS() {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [voices, setVoices] = useState([]);
    const [selectedVoice, setSelectedVoice] = useState(null);
    const synth = useRef(window.speechSynthesis);

    useEffect(() => {
        const updateVoices = () => {
            const vs = synth.current.getVoices();
            setVoices(vs);
            // Auto-select first compatible voice if none selected
            if (!selectedVoice && vs.length > 0) {
                // Prefer Google or Microsoft voices
                const preferred = vs.find(v => v.name.includes("Google") || v.name.includes("Microsoft")) || vs[0];
                setSelectedVoice(preferred);
            }
        };

        updateVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = updateVoices;
        }
    }, [selectedVoice]);

    const speak = useCallback((text) => {
        if (!text || !synth.current) return;

        // Cancel current
        synth.current.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        // Adjust rate/pitch slightly for more natural feel (optional)
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        synth.current.speak(utterance);
    }, [selectedVoice]);

    const cancel = useCallback(() => {
        if (synth.current) {
            synth.current.cancel();
            setIsSpeaking(false);
        }
    }, []);

    return {
        speak,
        cancel,
        isSpeaking,
        voices,
        selectedVoice,
        setSelectedVoice
    };
}

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for local LLM chat with Qwen3 WebGPU
 */
export function useLocalLLM({ systemPrompt, reasoningEnabled } = {}) {
    // Chat messages history
    const [messages, setMessages] = useState([]);

    // Current streaming state
    const [isGenerating, setIsGenerating] = useState(false);
    const isGeneratingRef = useRef(false);

    const [isModelLoading, setIsModelLoading] = useState(false);
    const [isModelReady, setIsModelReady] = useState(false);
    const [progress, setProgress] = useState([]);
    const [loadingStatus, setLoadingStatus] = useState('');
    const [error, setError] = useState(null);
    const [tps, setTps] = useState(null);
    const [numTokens, setNumTokens] = useState(null);

    const workerRef = useRef(null);

    useEffect(() => {
        isGeneratingRef.current = isGenerating;
    }, [isGenerating]);

    // Initialize worker
    useEffect(() => {
        workerRef.current = new Worker(
            new URL('../workers/llm.worker.js', import.meta.url),
            { type: 'module' }
        );

        workerRef.current.postMessage({ type: 'check' });

        workerRef.current.onmessage = (event) => {
            const message = event.data;

            switch (message.status) {
                case 'loading':
                    setIsModelLoading(true);
                    setLoadingStatus(message.data);
                    break;

                case 'initiate':
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
                    setIsModelReady(true);
                    setLoadingStatus('');
                    break;

                case 'start':
                    setMessages((prev) => {
                        const last = prev.at(-1);
                        if (last && last.role === 'assistant' && !last.content && !last.thought) {
                            return prev;
                        }
                        return [
                            ...prev,
                            { role: 'assistant', content: '', thought: '' },
                        ];
                    });
                    setIsGenerating(true);
                    isGeneratingRef.current = true;
                    break;

                case 'update':
                    setTps(message.tps);
                    setNumTokens(message.numTokens);
                    setMessages((prev) => {
                        const cloned = [...prev];
                        const lastIndex = cloned.length - 1;
                        const last = cloned[lastIndex];

                        const isThinking = message.state === 'thinking';

                        cloned[lastIndex] = {
                            ...last,
                            thought: isThinking ? (last.thought || '') + message.output : (last.thought || ''),
                            content: !isThinking ? (last.content || '') + message.output : (last.content || ''),
                        };
                        return cloned;
                    });
                    break;

                case 'complete':
                    setTps(message.tps);
                    setNumTokens(message.numTokens);
                    setIsGenerating(false);
                    isGeneratingRef.current = false;
                    break;

                case 'error':
                    setError(message.data?.message || 'Unknown error');
                    setIsGenerating(false);
                    isGeneratingRef.current = false;
                    break;
            }
        };

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
            }
        };
    }, []);

    const loadModel = useCallback(() => {
        if (!workerRef.current || isModelReady) return;
        workerRef.current.postMessage({ type: 'load' });
    }, [isModelReady]);

    const sendMessage = useCallback((content) => {
        if (!workerRef.current || isGeneratingRef.current) return;

        isGeneratingRef.current = true;
        setIsGenerating(true);

        let finalSystemPrompt = systemPrompt || 'You are a helpful voice assistant. Keep responses concise and conversational.';
        if (reasoningEnabled) {
            finalSystemPrompt += "\n\nCRITICAL: You are a reasoning model. You must output your thought process strictly between <think> and </think> tags before your final response.";
        }

        const userMessage = { role: 'user', content };
        const updatedMessages = [...messages, userMessage];

        setMessages(updatedMessages);

        workerRef.current.postMessage({
            type: 'generate',
            data: {
                messages: [
                    { role: 'system', content: finalSystemPrompt },
                    ...updatedMessages.filter(m => m.content.length > 0),
                ],
            },
        });

        setError(null);
        setTps(null);
    }, [messages, systemPrompt, reasoningEnabled]);

    const interrupt = useCallback(() => {
        if (!workerRef.current) return;
        workerRef.current.postMessage({ type: 'interrupt' });
    }, []);

    const reset = useCallback(() => {
        if (!workerRef.current) return;
        workerRef.current.postMessage({ type: 'reset' });
        setMessages([]);
        setTps(null);
        setNumTokens(null);
        setError(null);
    }, []);

    const lastResponse = messages.filter(m => m.role === 'assistant').at(-1)?.content || null;

    return {
        messages,
        lastResponse,
        isGenerating,
        isModelLoading,
        isModelReady,
        progress,
        loadingStatus,
        error,
        tps,
        numTokens,
        loadModel,
        sendMessage,
        interrupt,
        reset,
    };
}

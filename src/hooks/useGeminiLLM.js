import { useState, useRef, useCallback } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Custom hook for Gemini API Chat
 */
export function useGeminiLLM({ apiKey, model: modelName = "gemini-1.5-flash", systemPrompt, reasoningEnabled } = {}) {
    const [messages, setMessages] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);

    // Stats (simulated or unsupported for API)
    const [tps, setTps] = useState(null);
    const isModelLoading = false; // Always ready
    const isModelReady = true;
    const progress = [];
    const loadingStatus = '';

    const abortControllerRef = useRef(null);

    const loadModel = useCallback(() => { }, []); // No-op

    const sendMessage = useCallback(async (content) => {
        if (!apiKey) {
            setError("Missing Gemini API Key in Settings");
            return;
        }

        setIsGenerating(true);
        setError(null);
        setTps(null);

        // Add user message to UI
        const userMessage = { role: 'user', content };
        setMessages((prev) => [...prev, userMessage]);

        // Add placeholder for assistant
        setMessages((prev) => [...prev, { role: 'assistant', content: '', thought: '' }]);

        try {
            // Prepare System Instruction
            let finalSystemPrompt = systemPrompt || 'You are a helpful assistant.';
            if (reasoningEnabled) {
                finalSystemPrompt += "\n\nCRITICAL: You are a reasoning model. You must output your thought process strictly between <think> and </think> tags before your final response.";
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction: finalSystemPrompt
            });

            // Construct history
            const history = messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content || "" }]
            }));

            // Start Chat
            const chat = model.startChat({
                history: history,
            });

            abortControllerRef.current = new AbortController();

            const result = await chat.sendMessageStream(content);

            let fullText = "";
            let fullThought = "";
            let isThinking = false;

            // Stream Loop
            for await (const chunk of result.stream) {
                if (!isGenerating) break; // Check abort (manual)

                // Inspect raw chunk for thoughtSignature (Gemini 2.0+ Hidden Thoughts)
                const candidate = chunk.candidates?.[0];
                const part = candidate?.content?.parts?.[0];

                if (part && 'thoughtSignature' in part && !fullThought) {
                    console.log("[Gemini] Detected Thought Signature (Hidden Thoughts)");
                    fullThought = "Thinking process executed (Content hidden by Provider).";
                }

                let chunkText = "";
                try {
                    // Safe text extraction
                    if (part && typeof part.text === 'string') {
                        chunkText = part.text;
                    } else {
                        chunkText = chunk.text();
                    }
                } catch (e) {
                    // No text in this chunk (likely just metadata/thoughtSignature)
                }

                if (chunkText) {
                    // console.log("[Gemini] Text Chunk:", chunkText.length, "chars");
                }

                // Parser Logic for <think> tags (Backwards compatibility / other models)
                let remaining = chunkText;

                while (remaining.length > 0) {
                    if (!isThinking) {
                        const startIdx = remaining.indexOf("<think>");
                        if (startIdx !== -1) {
                            // Content before tag
                            fullText += remaining.substring(0, startIdx);
                            remaining = remaining.substring(startIdx + 7); // skip <think>
                            isThinking = true;
                        } else {
                            // No tag, all content
                            fullText += remaining;
                            remaining = "";
                        }
                    } else {
                        const endIdx = remaining.indexOf("</think>");
                        if (endIdx !== -1) {
                            // Thought before tag
                            if (fullThought !== "Thinking process executed (Content hidden by Provider).") {
                                fullThought += remaining.substring(0, endIdx);
                            }
                            remaining = remaining.substring(endIdx + 8); // skip </think>
                            isThinking = false;
                        } else {
                            // No tag, all thought
                            if (fullThought !== "Thinking process executed (Content hidden by Provider).") {
                                fullThought += remaining;
                            }
                            remaining = "";
                        }
                    }
                }

                // Update UI
                setMessages(prev => {
                    const cloned = [...prev];
                    const last = cloned[cloned.length - 1];
                    // Verify that the last message is indeed the assistant placeholder we added
                    if (last.role !== 'assistant') {
                        // Should not happen if prev is consistent, but safety check
                        return cloned;
                    }

                    cloned[cloned.length - 1] = {
                        ...last,
                        content: fullText,
                        thought: fullThought
                    };
                    return cloned;
                });
            }

            setIsGenerating(false);

        } catch (err) {
            console.error("Gemini Error:", err);
            setError(err.message || "Failed to generate response");
            setIsGenerating(false);
        }
    }, [apiKey, modelName, messages, systemPrompt, reasoningEnabled]);

    const interrupt = useCallback(() => {
        setIsGenerating(false);
    }, []);

    const reset = useCallback(() => {
        setMessages([]);
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
        numTokens: null,
        loadModel,
        sendMessage,
        interrupt,
        reset,
    };
}

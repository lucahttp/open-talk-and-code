import { useLocalLLM } from './useLocalLLM';
import { useGeminiLLM } from './useGeminiLLM';

/**
 * Facade hook for LLM Provider Selection
 * Switches between Local (WebGPU) and Gemini API logic
 */
export function useLLM({ provider = 'local', ...rest } = {}) {
    const local = useLocalLLM(rest);
    const gemini = useGeminiLLM(rest);

    const active = provider === 'gemini' ? gemini : local;

    return active;
}

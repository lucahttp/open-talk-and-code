import { useState, useEffect, useCallback, useRef } from 'react';
import { useTTS } from './useTTS';
import chiptune from '../services/chiptune';

/**
 * Hook para TTS con Barge-in Detection
 * 
 * Habla párrafo por párrafo usando useTTS base
 * Detecta comandos de interrupción durante el speech:
 *   - "stop", "detente", "para", "quiet", "silence", "shut up" → corta TTS, barge-in
 *   - "pause", "pausa", "espera" → pausa TTS, barge-in
 * 
 * Props: onBargeIn(command), onComplete(), onParagraph(index)
 * Returns: speakParagraphs(text), pause(), resume(), stop(), isSpeaking, currentParagraph
 */

export function useBargeInTTS({ onBargeIn, onComplete, onParagraph }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentParagraph, setCurrentParagraph] = useState(0);
  const [totalParagraphs, setTotalParagraphs] = useState(0);
  
  const paragraphsRef = useRef([]);
  const currentIndexRef = useRef(0);
  const recognitionRef = useRef(null);
  const ttsRef = useRef(null);
  const isPausedRef = useRef(false);
  const isBargeInDetectedRef = useRef(false);
  
  const BARGE_IN_COMMANDS = {
    stop: /stop|detente|para|quiet|silence|shut up|shutup|callate|silencio/i,
    pause: /pause|pausa|espera|wait|hold on|hold up/i,
  };
  
  // Get base TTS functions
  const baseTTS = useTTS();
  
  // Store TTS reference
  useEffect(() => {
    ttsRef.current = baseTTS;
  }, [baseTTS]);
  
  // Start barge-in detection
  const startBargeInDetection = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[BargeInTTS] Web Speech API not supported for barge-in');
      return;
    }
    
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      
      recognition.onresult = (event) => {
        // Check all results
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.toLowerCase();
          
          // Check for stop command
          if (BARGE_IN_COMMANDS.stop.test(transcript) && !isBargeInDetectedRef.current) {
            console.log('[BargeInTTS] Stop command detected:', transcript);
            isBargeInDetectedRef.current = true;
            stop();
            onBargeIn?.('stop');
            return;
          }
          
          // Check for pause command
          if (BARGE_IN_COMMANDS.pause.test(transcript) && !isBargeInDetectedRef.current) {
            console.log('[BargeInTTS] Pause command detected:', transcript);
            isBargeInDetectedRef.current = true;
            pause();
            onBargeIn?.('pause');
            return;
          }
        }
      };
      
      recognition.onerror = (event) => {
        // Ignore errors, just keep trying
        if (event.error === 'no-speech' || event.error === 'audio-capture') {
          return;
        }
        console.warn('[BargeInTTS] Recognition error:', event.error);
      };
      
      recognition.onend = () => {
        // Restart if still speaking and not paused
        if (isSpeaking && !isPausedRef.current && !isBargeInDetectedRef.current) {
          try {
            recognition.start();
          } catch (e) {
            // Already started or other error
          }
        }
      };
      
      recognition.start();
      recognitionRef.current = recognition;
      
    } catch (err) {
      console.error('[BargeInTTS] Failed to start barge-in detection:', err);
    }
  }, [onBargeIn]);
  
  // Stop barge-in detection
  const stopBargeInDetection = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      recognitionRef.current = null;
    }
  }, []);
  
  // Speak a single paragraph
  const speakParagraph = useCallback(async (text, index) => {
    return new Promise((resolve) => {
      if (!text.trim()) {
        resolve();
        return;
      }
      
      // Update current paragraph
      setCurrentParagraph(index);
      currentIndexRef.current = index;
      onParagraph?.(index);
      
      // Use base TTS to speak
      baseTTS.speak(text);
      
      // Wait for completion or interruption
      const checkInterval = setInterval(() => {
        if (isBargeInDetectedRef.current || isPausedRef.current) {
          clearInterval(checkInterval);
          resolve();
        } else if (!baseTTS.isSpeaking) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }, [baseTTS, onParagraph]);
  
  // Speak all paragraphs
  const speakParagraphs = useCallback(async (text) => {
    if (!text.trim()) return;
    
    // Split into paragraphs
    const paragraphs = text
      .split(/\n\n+|(?<=[.!?])\s+(?=[A-Z])/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    if (paragraphs.length === 0) return;
    
    paragraphsRef.current = paragraphs;
    setTotalParagraphs(paragraphs.length);
    setIsSpeaking(true);
    setIsPaused(false);
    isPausedRef.current = false;
    isBargeInDetectedRef.current = false;
    
    console.log('[BargeInTTS] Speaking', paragraphs.length, 'paragraphs');
    
    // Start barge-in detection
    startBargeInDetection();
    
    // Speak each paragraph
    for (let i = 0; i < paragraphs.length; i++) {
      if (isBargeInDetectedRef.current) {
        break; // Stop detected
      }
      
      if (isPausedRef.current) {
        // Wait until resumed
        await new Promise(resolve => {
          const checkResume = setInterval(() => {
            if (!isPausedRef.current || isBargeInDetectedRef.current) {
              clearInterval(checkResume);
              resolve();
            }
          }, 100);
        });
        
        if (isBargeInDetectedRef.current) break;
      }
      
      await speakParagraph(paragraphs[i], i);
    }
    
    // Cleanup
    stopBargeInDetection();
    
    if (!isBargeInDetectedRef.current) {
      // Completed naturally
      setIsSpeaking(false);
      onComplete?.();
    }
  }, [startBargeInDetection, stopBargeInDetection, speakParagraph, onComplete]);
  
  // Pause TTS
  const pause = useCallback(() => {
    console.log('[BargeInTTS] Pausing');
    setIsPaused(true);
    isPausedRef.current = true;
    
    // Pause base TTS
    if (window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
    
    // Stop barge-in detection temporarily
    stopBargeInDetection();
  }, [stopBargeInDetection]);
  
  // Resume TTS
  const resume = useCallback(() => {
    console.log('[BargeInTTS] Resuming');
    setIsPaused(false);
    isPausedRef.current = false;
    
    // Resume base TTS
    if (window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
    
    // Restart barge-in detection
    startBargeInDetection();
  }, [startBargeInDetection]);
  
  // Stop TTS completely
  const stop = useCallback(() => {
    console.log('[BargeInTTS] Stopping');
    setIsSpeaking(false);
    setIsPaused(false);
    isPausedRef.current = false;
    isBargeInDetectedRef.current = true;
    
    // Stop base TTS
    baseTTS.cancel();
    
    // Stop barge-in detection
    stopBargeInDetection();
  }, [baseTTS, stopBargeInDetection]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBargeInDetection();
    };
  }, [stopBargeInDetection]);
  
  return {
    speakParagraphs,
    pause,
    resume,
    stop,
    isSpeaking,
    isPaused,
    currentParagraph,
    totalParagraphs,
    voices: baseTTS.voices,
    selectedVoice: baseTTS.selectedVoice,
    setSelectedVoice: baseTTS.setSelectedVoice,
  };
}

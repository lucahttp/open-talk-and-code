import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook para Quick Listen - 15 segundos de escucha post-TTS
 * 
 * Usa Web Speech API para mayor velocidad (vs Whisper)
 * Detecta comandos especiales: "never mind", "cancel", "olvida"
 * 
 * Props: duration=15000, onTranscript(text), onTimeout(), onCancel()
 * Returns: start(), stop(), secondsRemaining, isListening, transcript
 */

export function useQuickListen({ 
  duration = 15000, 
  onTranscript, 
  onTimeout, 
  onCancel 
}) {
  const [isListening, setIsListening] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [transcript, setTranscript] = useState('');
  
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const startTimeRef = useRef(null);
  
  const CANCEL_COMMANDS = /never mind|cancel|olvida|olvidalo|forget it|abort/i;
  
  // Stop listening
  const stop = useCallback(() => {
    console.log('[QuickListen] Stopping');
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      recognitionRef.current = null;
    }
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    setIsListening(false);
    setSecondsRemaining(0);
  }, []);
  
  // Start listening
  const start = useCallback(async () => {
    console.log('[QuickListen] Starting', duration, 'ms listen');
    
    // Reset state
    setTranscript('');
    setIsListening(true);
    setSecondsRemaining(Math.ceil(duration / 1000));
    startTimeRef.current = Date.now();
    
    // Check Web Speech API support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[QuickListen] Web Speech API not supported');
      onTimeout?.();
      return;
    }
    
    try {
      // Create recognition instance
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      
      let finalTranscript = '';
      let hasDetectedSpeech = false;
      
      recognition.onresult = (event) => {
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        // Update UI with current transcript
        const currentTranscript = finalTranscript + interimTranscript;
        setTranscript(currentTranscript);
        
        // Check if user said something (not just noise)
        if (currentTranscript.trim().length > 0) {
          hasDetectedSpeech = true;
        }
        
        // Check for cancel commands in final or interim results
        if (CANCEL_COMMANDS.test(currentTranscript)) {
          console.log('[QuickListen] Cancel command detected:', currentTranscript);
          stop();
          onCancel?.();
          return;
        }
        
        // Check for substantive transcript (more than 3 words)
        const wordCount = currentTranscript.trim().split(/\s+/).length;
        if (wordCount >= 3 && event.results[event.results.length - 1].isFinal) {
          console.log('[QuickListen] Substantive transcript detected:', finalTranscript);
          stop();
          onTranscript?.(finalTranscript.trim());
          return;
        }
      };
      
      recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
          // No speech detected - continue listening until timeout
          console.log('[QuickListen] No speech detected yet');
          return;
        }
        
        if (event.error === 'aborted') {
          // Recognition aborted - probably manual stop
          console.log('[QuickListen] Recognition aborted');
          return;
        }
        
        console.warn('[QuickListen] Recognition error:', event.error);
      };
      
      recognition.onend = () => {
        console.log('[QuickListen] Recognition ended');
        // If we have a final transcript, use it
        if (finalTranscript.trim()) {
          stop();
          onTranscript?.(finalTranscript.trim());
        }
      };
      
      // Start recognition
      recognition.start();
      recognitionRef.current = recognition;
      
      // Start timer countdown
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
        setSecondsRemaining(remaining);
        
        if (remaining <= 0) {
          stop();
          if (!hasDetectedSpeech && !finalTranscript.trim()) {
            onTimeout?.();
          } else if (finalTranscript.trim()) {
            onTranscript?.(finalTranscript.trim());
          }
        }
      }, 100);
      
      // Set absolute timeout
      timerRef.current = setTimeout(() => {
        console.log('[QuickListen] Timeout reached');
        stop();
        if (!hasDetectedSpeech && !finalTranscript.trim()) {
          onTimeout?.();
        } else if (finalTranscript.trim()) {
          onTranscript?.(finalTranscript.trim());
        }
      }, duration);
      
    } catch (err) {
      console.error('[QuickListen] Failed to start recognition:', err);
      setIsListening(false);
      onTimeout?.();
    }
  }, [duration, onTranscript, onTimeout, onCancel, stop]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);
  
  return {
    start,
    stop,
    isListening,
    secondsRemaining,
    transcript,
  };
}

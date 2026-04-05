import { useState, useEffect, useCallback, useRef } from 'react';
import { useGracePeriodRecorder } from './useGracePeriodRecorder';
import { useBargeInTTS } from './useBargeInTTS';
import { useQuickListen } from './useQuickListen';
import { useTranscriber } from './useTranscriber';
import intentClassifier from '../services/intent';

/**
 * Conversation Orchestrator Hook
 * 
 * State Machine completo:
 * IDLE → RECORDING (wake word) → GRACE_PERIOD → TRANSCRIBING → SENDING → SPEAKING
 *                                                                               │
 *                          ┌────────────────────────────────────────────────────┘
 *                          │
 *              ┌───────────┴───────────┐
 *              ▼                       ▼
 *      [Barge-in "stop"]        [TTS completes]
 *              │                       │
 *              ▼                       ▼
 *      INTERRUPTING              QUICK_LISTEN (15s)
 *              │                       │
 *              └───────────┬───────────┘
 *                          │
 *              ┌───────────┴───────────┐
 *              ▼                       ▼
 *      [User speaks]              [15s timeout]
 *              │                       │
 *              └───────────┬───────────┘
 *                          ▼
 *                    SENDING (loop) → SPEAKING
 * 
 * Props: 
 *   - onTranscript(text): cuando se transcribe algo
 *   - onSendToOpenCode(text): cuando hay que enviar a OpenCode
 *   - onResponse(text): cuando llega respuesta del LLM
 *   - onStateChange(state): cambios de estado (opcional)
 * 
 * Returns:
 *   - state: estado actual
 *   - startRecording(), stopCurrent(), interruptGracePeriod()
 *   - graceSeconds, quickListenSeconds
 *   - isListeningForBargeIn, currentParagraph, totalParagraphs
 */

const STATES = {
  IDLE: 'idle',
  RECORDING: 'recording',
  GRACE_PERIOD: 'grace_period',
  TRANSCRIBING: 'transcribing',
  SENDING: 'sending',
  SPEAKING: 'speaking',
  PAUSED: 'paused',
  INTERRUPTING: 'interrupting',
  QUICK_LISTEN: 'quick_listen',
  ERROR: 'error',
};

export function useConversationOrchestrator({ 
  onTranscript, 
  onSendToOpenCode, 
  onResponse, 
  onStateChange,
  onError,
  // External hooks/callbacks passed from parent
  externalStartRecording,
  externalStopRecording,
  externalIsRecording,
  externalTranscriber,
  externalTTS,
  externalHeyBuddyState,
}) {
  const [state, setState] = useState(STATES.IDLE);
  const [graceSeconds, setGraceSeconds] = useState(0);
  const [quickListenSeconds, setQuickListenSeconds] = useState(0);
  const [isListeningForBargeIn, setIsListeningForBargeIn] = useState(false);
  const [currentParagraph, setCurrentParagraph] = useState(0);
  const [totalParagraphs, setTotalParagraphs] = useState(0);
  const [error, setError] = useState(null);
  
  // Refs for state management
  const stateRef = useRef(STATES.IDLE);
  const pendingMessageRef = useRef(null);
  const abortControllerRef = useRef(null);
  
  // Update state ref and notify parent
  const updateState = useCallback((newState) => {
    setState(newState);
    stateRef.current = newState;
    onStateChange?.(newState);
    console.log('[Orchestrator] State:', newState);
  }, [onStateChange]);
  
  // Grace Period Recorder
  const graceRecorder = useGracePeriodRecorder({
    onComplete: async (audioBuffer) => {
      if (!audioBuffer) {
        updateState(STATES.IDLE);
        return;
      }
      
      // Move to transcribing
      updateState(STATES.TRANSCRIBING);
      
      // Transcribe using Whisper
      try {
        await transcribeAudio(audioBuffer);
      } catch (err) {
        console.error('[Orchestrator] Transcription failed:', err);
        setError('Transcription failed');
        updateState(STATES.ERROR);
        onError?.(err);
      }
    },
    onGraceTick: (seconds) => {
      setGraceSeconds(seconds);
    },
    onInterrupt: () => {
      // Grace period was interrupted - continue recording
      console.log('[Orchestrator] Grace period interrupted, continuing...');
    },
  });
  
  // Transcriber
  const transcriber = useTranscriber();
  
  // Barge-in TTS
  const bargeInTTS = useBargeInTTS({
    onBargeIn: (command) => {
      console.log('[Orchestrator] Barge-in detected:', command);
      
      if (command === 'stop') {
        updateState(STATES.INTERRUPTING);
        // Go to quick listen immediately
        startQuickListen();
      } else if (command === 'pause') {
        updateState(STATES.PAUSED);
        // Stay paused, user can resume or speak new command
      }
    },
    onComplete: () => {
      console.log('[Orchestrator] TTS completed naturally');
      // Go to quick listen
      startQuickListen();
    },
    onParagraph: (index) => {
      setCurrentParagraph(index);
    },
  });
  
  // Quick Listen
  const quickListen = useQuickListen({
    duration: 15000,
    onTranscript: (text) => {
      console.log('[Orchestrator] Quick listen transcript:', text);
      handleQuickListenTranscript(text);
    },
    onTimeout: () => {
      console.log('[Orchestrator] Quick listen timeout, going idle');
      updateState(STATES.IDLE);
    },
    onCancel: () => {
      console.log('[Orchestrator] Quick listen cancelled');
      updateState(STATES.IDLE);
    },
  });
  
  // Transcribe audio buffer
  const transcribeAudio = useCallback(async (audioBuffer) => {
    console.log('[Orchestrator] Transcribing audio...');
    
    // Convert AudioBuffer to Float32Array for Whisper
    const audioData = audioBuffer.getChannelData(0);
    
    // Use transcriber
    return new Promise((resolve, reject) => {
      // Check if transcriber is ready
      if (!transcriber.transcribe) {
        reject(new Error('Transcriber not ready'));
        return;
      }
      
      // Start transcription
      transcriber.transcribe(audioData);
      
      // Wait for result
      const checkInterval = setInterval(() => {
        if (transcriber.transcript && !transcriber.isTranscribing) {
          clearInterval(checkInterval);
          const text = transcriber.transcript.text;
          if (text) {
            onTranscript?.(text);
            resolve(text);
          } else {
            reject(new Error('No transcription result'));
          }
        }
      }, 100);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Transcription timeout'));
      }, 30000);
    });
  }, [transcriber, onTranscript]);
  
  // Start recording (called by wake word or manual)
  const startRecording = useCallback(async () => {
    console.log('[Orchestrator] Starting recording');
    updateState(STATES.RECORDING);
    await graceRecorder.start();
  }, [graceRecorder, updateState]);
  
  // Stop current activity
  const stopCurrent = useCallback(() => {
    console.log('[Orchestrator] Stopping current activity');
    
    // Stop any ongoing processes
    graceRecorder.stop();
    bargeInTTS.stop();
    quickListen.stop();
    transcriber.clear?.();
    
    // Cancel any pending OpenCode request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    updateState(STATES.IDLE);
  }, [graceRecorder, bargeInTTS, quickListen, transcriber, updateState]);
  
  // Resume from paused state
  const resumeFromPause = useCallback(() => {
    if (stateRef.current === STATES.PAUSED) {
      bargeInTTS.resume();
      updateState(STATES.SPEAKING);
    }
  }, [bargeInTTS, updateState]);
  
  // Handle quick listen transcript
  const handleQuickListenTranscript = useCallback(async (text) => {
    if (!text.trim()) return;
    
    // Classify intent
    const intent = await intentClassifier.classify(text);
    console.log('[Orchestrator] Intent:', intent);
    
    if (intent.type === 'command') {
      // Handle commands during quick listen
      if (intent.action === '/interrupt' || intent.action === '/stop') {
        // Stop everything, go idle
        updateState(STATES.IDLE);
        return;
      }
      
      // Other commands - execute directly
      // TODO: Execute command
      updateState(STATES.IDLE);
    } else {
      // Treat as new message, send to OpenCode
      pendingMessageRef.current = text;
      updateState(STATES.SENDING);
      await sendToOpenCode(text);
    }
  }, [updateState]);
  
  // Send to OpenCode
  const sendToOpenCode = useCallback(async (text) => {
    console.log('[Orchestrator] Sending to OpenCode:', text);
    
    updateState(STATES.SENDING);
    
    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();
    
    try {
      await onSendToOpenCode?.(text, abortControllerRef.current.signal);
      
      // If not aborted, move to speaking
      if (!abortControllerRef.current.signal.aborted) {
        updateState(STATES.SPEAKING);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[Orchestrator] Request aborted');
        return;
      }
      
      console.error('[Orchestrator] Send failed:', err);
      setError('Failed to send message');
      updateState(STATES.ERROR);
      onError?.(err);
    }
  }, [onSendToOpenCode, onError, updateState]);
  
  // Handle response from OpenCode
  const handleResponse = useCallback((text) => {
    console.log('[Orchestrator] Received response:', text?.substring(0, 100));
    
    onResponse?.(text);
    
    // Split into paragraphs and speak
    const paragraphs = text
      .split(/\n\n+|(?<=[.!?])\s+(?=[A-Z])/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    setTotalParagraphs(paragraphs.length);
    setCurrentParagraph(0);
    setIsListeningForBargeIn(true);
    
    // Start speaking
    bargeInTTS.speakParagraphs(text);
  }, [bargeInTTS, onResponse]);
  
  // Start quick listen
  const startQuickListen = useCallback(() => {
    updateState(STATES.QUICK_LISTEN);
    setIsListeningForBargeIn(false);
    quickListen.start();
  }, [quickListen, updateState]);
  
  // Update paragraph info from bargeInTTS
  useEffect(() => {
    setCurrentParagraph(bargeInTTS.currentParagraph);
    setTotalParagraphs(bargeInTTS.totalParagraphs);
    setIsListeningForBargeIn(bargeInTTS.isSpeaking);
  }, [bargeInTTS.currentParagraph, bargeInTTS.totalParagraphs, bargeInTTS.isSpeaking]);
  
  // Update quick listen seconds
  useEffect(() => {
    setQuickListenSeconds(quickListen.secondsRemaining);
  }, [quickListen.secondsRemaining]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCurrent();
    };
  }, []);
  
  return {
    // State
    state,
    STATES,
    graceSeconds,
    quickListenSeconds,
    isListeningForBargeIn,
    currentParagraph,
    totalParagraphs,
    error,
    
    // Actions
    startRecording,
    stopCurrent,
    resumeFromPause,
    handleResponse,
    
    // Direct access to sub-hooks if needed
    graceRecorder,
    bargeInTTS,
    quickListen,
    transcriber,
  };
}

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Simplified Conversation State Machine
 * 
 * This hook only manages state transitions, NOT audio/TTS/transcription.
 * All audio operations are handled by external hooks in the parent component.
 * 
 * States: IDLE → RECORDING → GRACE_PERIOD → TRANSCRIBING → SENDING → SPEAKING → [QUICK_LISTEN|INTERRUPTING|PAUSED]
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

export { STATES };

export function useConversationStateMachine({ 
  onStateChange,
  onGracePeriodTick,
  onQuickListenTick,
}) {
  const [state, setState] = useState(STATES.IDLE);
  const [graceSeconds, setGraceSeconds] = useState(0);
  const [quickListenSeconds, setQuickListenSeconds] = useState(0);
  const [currentParagraph, setCurrentParagraph] = useState(0);
  const [totalParagraphs, setTotalParagraphs] = useState(0);
  const [isListeningForBargeIn, setIsListeningForBargeIn] = useState(false);
  
  const stateRef = useRef(STATES.IDLE);
  const graceTimerRef = useRef(null);
  const quickListenTimerRef = useRef(null);
  
  // Update state ref and notify parent
  const updateState = useCallback((newState, data = null) => {
    setState(newState);
    stateRef.current = newState;
    onStateChange?.(newState, data);
    console.log('[StateMachine] State:', newState, data);
  }, [onStateChange]);
  
  // Start recording (wake word detected)
  const startRecording = useCallback(() => {
    if (stateRef.current !== STATES.IDLE) {
      console.log('[StateMachine] Already active, ignoring start');
      return false;
    }
    updateState(STATES.RECORDING);
    return true;
  }, [updateState]);
  
  // Enter grace period (silence detected)
  const startGracePeriod = useCallback(() => {
    if (stateRef.current !== STATES.RECORDING) return;
    
    updateState(STATES.GRACE_PERIOD);
    setGraceSeconds(5);
    
    // Countdown timer
    let remaining = 5;
    graceTimerRef.current = setInterval(() => {
      remaining -= 1;
      setGraceSeconds(remaining);
      onGracePeriodTick?.(remaining);
      
      if (remaining <= 0) {
        clearInterval(graceTimerRef.current);
        // Grace period complete, move to transcribing
        updateState(STATES.TRANSCRIBING);
      }
    }, 1000);
  }, [updateState, onGracePeriodTick]);
  
  // Interrupt grace period (audio detected)
  const interruptGracePeriod = useCallback(() => {
    if (stateRef.current !== STATES.GRACE_PERIOD) return;
    
    clearInterval(graceTimerRef.current);
    setGraceSeconds(0);
    updateState(STATES.RECORDING);
  }, [updateState]);
  
  // Start transcribing
  const startTranscribing = useCallback(() => {
    if (stateRef.current !== STATES.GRACE_PERIOD) {
      // Can also be called directly from recording if manual stop
      if (stateRef.current !== STATES.RECORDING) return;
    }
    
    clearInterval(graceTimerRef.current);
    setGraceSeconds(0);
    updateState(STATES.TRANSCRIBING);
  }, [updateState]);
  
  // Start sending to OpenCode
  const startSending = useCallback(() => {
    if (stateRef.current !== STATES.TRANSCRIBING) return;
    updateState(STATES.SENDING);
  }, [updateState]);
  
  // Start TTS speaking
  const startSpeaking = useCallback((paragraphCount = 1) => {
    if (stateRef.current !== STATES.SENDING) return;
    
    setTotalParagraphs(paragraphCount);
    setCurrentParagraph(0);
    setIsListeningForBargeIn(true);
    updateState(STATES.SPEAKING);
  }, [updateState]);
  
  // Update current paragraph during speaking
  const updateParagraph = useCallback((index) => {
    setCurrentParagraph(index);
  }, []);
  
  // Barge-in detected ("stop" or "pause")
  const onBargeIn = useCallback((command) => {
    if (stateRef.current !== STATES.SPEAKING && stateRef.current !== STATES.PAUSED) return;
    
    setIsListeningForBargeIn(false);
    
    if (command === 'stop') {
      updateState(STATES.INTERRUPTING, { command });
      // Immediately go to quick listen
      startQuickListen();
    } else if (command === 'pause') {
      updateState(STATES.PAUSED, { command });
    }
  }, [updateState]);
  
  // Resume from pause
  const resumeFromPause = useCallback(() => {
    if (stateRef.current !== STATES.PAUSED) return;
    
    setIsListeningForBargeIn(true);
    updateState(STATES.SPEAKING);
  }, [updateState]);
  
  // TTS completed naturally
  const onSpeakingComplete = useCallback(() => {
    if (stateRef.current !== STATES.SPEAKING) return;
    
    setIsListeningForBargeIn(false);
    startQuickListen();
  }, []);
  
  // Start quick listen (15s)
  const startQuickListen = useCallback(() => {
    updateState(STATES.QUICK_LISTEN);
    setQuickListenSeconds(15);
    
    let remaining = 15;
    quickListenTimerRef.current = setInterval(() => {
      remaining -= 1;
      setQuickListenSeconds(remaining);
      onQuickListenTick?.(remaining);
      
      if (remaining <= 0) {
        clearInterval(quickListenTimerRef.current);
        // Timeout - go to idle
        updateState(STATES.IDLE, { reason: 'timeout' });
      }
    }, 1000);
  }, [updateState, onQuickListenTick]);
  
  // User spoke during quick listen
  const onQuickListenTranscript = useCallback((text) => {
    if (stateRef.current !== STATES.QUICK_LISTEN) return;
    
    clearInterval(quickListenTimerRef.current);
    setQuickListenSeconds(0);
    
    // Go back to sending (loop)
    updateState(STATES.SENDING, { text, fromQuickListen: true });
  }, [updateState]);
  
  // Cancel quick listen ("never mind")
  const cancelQuickListen = useCallback(() => {
    if (stateRef.current !== STATES.QUICK_LISTEN) return;
    
    clearInterval(quickListenTimerRef.current);
    setQuickListenSeconds(0);
    updateState(STATES.IDLE, { reason: 'cancelled' });
  }, [updateState]);
  
  // Go to error state
  const setError = useCallback((errorMessage) => {
    updateState(STATES.ERROR, { error: errorMessage });
  }, [updateState]);
  
  // Reset to idle
  const resetToIdle = useCallback(() => {
    clearInterval(graceTimerRef.current);
    clearInterval(quickListenTimerRef.current);
    setGraceSeconds(0);
    setQuickListenSeconds(0);
    setIsListeningForBargeIn(false);
    setCurrentParagraph(0);
    setTotalParagraphs(0);
    updateState(STATES.IDLE);
  }, [updateState]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(graceTimerRef.current);
      clearInterval(quickListenTimerRef.current);
    };
  }, []);
  
  return {
    // Current state
    state,
    STATES,
    
    // UI data
    graceSeconds,
    quickListenSeconds,
    currentParagraph,
    totalParagraphs,
    isListeningForBargeIn,
    
    // State transitions
    startRecording,
    startGracePeriod,
    interruptGracePeriod,
    startTranscribing,
    startSending,
    startSpeaking,
    updateParagraph,
    onBargeIn,
    resumeFromPause,
    onSpeakingComplete,
    onQuickListenTranscript,
    cancelQuickListen,
    setError,
    resetToIdle,
  };
}

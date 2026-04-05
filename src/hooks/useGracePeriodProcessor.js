import { useState, useEffect, useCallback, useRef } from 'react';
import chiptune from '../services/chiptune';

/**
 * Hook para Grace Period Processing
 * 
 * Este hook NO graba audio - recibe audio de HeyBuddy y procesa el grace period
 * lógicamente. Cuando HeyBuddy detecta silencio y envía audio, este hook:
 * 
 * 1. Inicia un timer de 5 segundos (grace period)
 * 2. Si HeyBuddy envía más audio durante ese tiempo, resetea el timer
 * 3. Si pasan 5 segundos sin nuevo audio, llama onComplete con el audio acumulado
 * 
 * Props: onComplete(audioBuffer), onGraceTick(seconds), onInterrupt()
 * Returns: processAudio(audioSamples), isProcessing, graceSeconds, isInGracePeriod
 */

export function useGracePeriodProcessor({ onComplete, onGraceTick, onInterrupt }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInGracePeriod, setIsInGracePeriod] = useState(false);
  const [graceSeconds, setGraceSeconds] = useState(0);
  
  const audioChunksRef = useRef([]);
  const graceTimerRef = useRef(null);
  const graceTimeoutRef = useRef(null);
  const isGracePeriodRef = useRef(false);
  const graceStartTimeRef = useRef(null);
  
  const GRACE_PERIOD_MS = 5000;
  
  // Start grace period countdown
  const startGracePeriod = useCallback(() => {
    if (isGracePeriodRef.current) return; // Already in grace period
    
    console.log('[GracePeriodProcessor] Starting grace period (5s)');
    setIsInGracePeriod(true);
    isGracePeriodRef.current = true;
    graceStartTimeRef.current = Date.now();
    
    // Update UI every second
    graceTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - graceStartTimeRef.current;
      const remaining = Math.max(0, Math.ceil((GRACE_PERIOD_MS - elapsed) / 1000));
      setGraceSeconds(remaining);
      onGraceTick?.(remaining);
    }, 100);
    
    // Final timeout
    graceTimeoutRef.current = setTimeout(() => {
      finalizeProcessing();
    }, GRACE_PERIOD_MS);
  }, [onGraceTick]);
  
  // Interrupt grace period (new audio received)
  const interruptGracePeriod = useCallback(() => {
    if (!isGracePeriodRef.current) return;
    
    console.log('[GracePeriodProcessor] Grace period interrupted - new audio received');
    
    // Play "revive" chiptune
    chiptune.playGracePeriodReset();
    
    // Clear timers
    if (graceTimerRef.current) {
      clearInterval(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }
    
    // Reset state
    setIsInGracePeriod(false);
    isGracePeriodRef.current = false;
    setGraceSeconds(0);
    graceStartTimeRef.current = null;
    
    // Notify parent
    onInterrupt?.();
  }, [onInterrupt]);
  
  // Finalize processing - convert accumulated chunks to audio buffer
  const finalizeProcessing = useCallback(async () => {
    console.log('[GracePeriodProcessor] Finalizing with', audioChunksRef.current.length, 'audio chunks');
    
    // Clear timers
    if (graceTimerRef.current) clearInterval(graceTimerRef.current);
    if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
    
    // Combine all audio chunks
    if (audioChunksRef.current.length === 0) {
      console.log('[GracePeriodProcessor] No audio chunks, returning null');
      onComplete?.(null);
      resetState();
      return;
    }
    
    // Concatenate all Float32Arrays
    const totalLength = audioChunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedAudio = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunksRef.current) {
      combinedAudio.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Create AudioBuffer
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = audioContext.createBuffer(1, combinedAudio.length, 16000);
      audioBuffer.copyToChannel(combinedAudio, 0);
      await audioContext.close();
      
      // Notify parent
      onComplete?.(audioBuffer);
    } catch (err) {
      console.error('[GracePeriodProcessor] Failed to create audio buffer:', err);
      onComplete?.(null);
    }
    
    resetState();
  }, [onComplete]);
  
  // Reset state
  const resetState = useCallback(() => {
    setIsProcessing(false);
    setIsInGracePeriod(false);
    isGracePeriodRef.current = false;
    setGraceSeconds(0);
    audioChunksRef.current = [];
    graceStartTimeRef.current = null;
  }, []);
  
  // Process audio samples from HeyBuddy
  const processAudio = useCallback((audioSamples) => {
    console.log('[GracePeriodProcessor] Received audio:', audioSamples.length, 'samples');
    
    // Add to chunks
    audioChunksRef.current.push(new Float32Array(audioSamples));
    
    // Start processing if not already
    if (!isProcessing) {
      console.log('[GracePeriodProcessor] Starting processing');
      setIsProcessing(true);
    }
    
    // If in grace period, interrupt it (user is still speaking)
    if (isGracePeriodRef.current) {
      interruptGracePeriod();
    }
    
    // Start grace period countdown (will finalize if no more audio comes)
    startGracePeriod();
  }, [isProcessing, startGracePeriod, interruptGracePeriod]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (graceTimerRef.current) clearInterval(graceTimerRef.current);
      if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
    };
  }, []);
  
  return {
    processAudio,
    isProcessing,
    isInGracePeriod,
    graceSeconds,
    resetState,
  };
}

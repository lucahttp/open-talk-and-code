import { useState, useEffect, useCallback, useRef } from 'react';
import chiptune from '../services/chiptune';

/**
 * Hook para grabación con Grace Period de 5 segundos
 * 
 * Funcionamiento:
 * - Graba audio continuamente usando MediaRecorder
 * - VAD detecta silencio → inicia 5s timer
 * - UI muestra countdown (5, 4, 3, 2, 1, 0)
 * - Si audio detectado durante grace period → reset timer, suena chiptune "revive"
 * - Si 5s pasan sin audio → finaliza, devuelve audioBuffer
 * 
 * Props: onComplete(audioBuffer), onGraceTick(seconds), onInterrupt()
 * Returns: start(), stop(), isRecording, graceSeconds, isInGracePeriod
 */

export function useGracePeriodRecorder({ onComplete, onGraceTick, onInterrupt }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isInGracePeriod, setIsInGracePeriod] = useState(false);
  const [graceSeconds, setGraceSeconds] = useState(0);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const graceTimerRef = useRef(null);
  const graceTimeoutRef = useRef(null);
  const vadRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const isGracePeriodRef = useRef(false);
  const silenceStartRef = useRef(null);
  const graceStartTimeRef = useRef(null);
  
  const GRACE_PERIOD_MS = 5000;
  const SILENCE_THRESHOLD = 0.02; // RMS threshold for silence
  const SILENCE_DURATION_MS = 1500; // 1.5s of silence to trigger grace period
  
  // Initialize audio context for VAD
  const initAudioContext = useCallback(async (stream) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Try to resume - may fail if no user gesture yet
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
        } catch (e) {
          console.log('[GracePeriodRecorder] AudioContext needs user gesture');
        }
      }
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      return { audioContext, analyser };
    } catch (err) {
      console.error('[GracePeriodRecorder] Failed to init audio context:', err);
      return null;
    }
  }, []);
  
  // VAD detection using RMS
  const detectVoiceActivity = useCallback(() => {
    if (!analyserRef.current || !isRecording) return false;
    
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    
    // Calculate RMS
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const x = (dataArray[i] - 128) / 128;
      sum += x * x;
    }
    const rms = Math.sqrt(sum / bufferLength);
    
    return rms > SILENCE_THRESHOLD;
  }, [isRecording]);
  
  // Start grace period countdown
  const startGracePeriod = useCallback(() => {
    if (isGracePeriodRef.current) return; // Already in grace period
    
    console.log('[GracePeriodRecorder] Starting grace period (5s)');
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
      finalizeRecording();
    }, GRACE_PERIOD_MS);
  }, [onGraceTick]);
  
  // Interrupt grace period (user spoke during grace period)
  const interruptGracePeriod = useCallback(() => {
    if (!isGracePeriodRef.current) return;
    
    console.log('[GracePeriodRecorder] Grace period interrupted - continuing recording');
    
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
    silenceStartRef.current = null;
    
    // Notify parent
    onInterrupt?.();
  }, [onInterrupt]);
  
  // Finalize recording - convert chunks to audio buffer
  const finalizeRecording = useCallback(async () => {
    console.log('[GracePeriodRecorder] Finalizing recording');
    
    // Stop everything
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      await audioContextRef.current.close();
    }
    
    // Clear timers
    if (graceTimerRef.current) clearInterval(graceTimerRef.current);
    if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
    
    // Convert chunks to blob
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    
    // Convert blob to AudioBuffer
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Close temp context
      await audioContext.close();
      
      // Notify parent with audioBuffer
      onComplete?.(audioBuffer);
    } catch (err) {
      console.error('[GracePeriodRecorder] Failed to decode audio:', err);
      onComplete?.(null);
    }
    
    // Reset state
    setIsRecording(false);
    setIsInGracePeriod(false);
    isGracePeriodRef.current = false;
    setGraceSeconds(0);
    audioChunksRef.current = [];
  }, [onComplete]);
  
  // VAD monitoring loop
  const startVADMonitoring = useCallback(() => {
    const checkInterval = 100; // Check every 100ms
    
    const checkVAD = () => {
      if (!isRecording) return;
      
      const hasVoice = detectVoiceActivity();
      
      if (hasVoice) {
        // Voice detected
        if (isGracePeriodRef.current) {
          // Interrupt grace period - user is still speaking!
          interruptGracePeriod();
        } else {
          // Normal recording, reset silence tracking
          silenceStartRef.current = null;
        }
      } else {
        // Silence detected
        if (!silenceStartRef.current) {
          silenceStartRef.current = Date.now();
        } else {
          const silenceDuration = Date.now() - silenceStartRef.current;
          
          // If silence > threshold and not in grace period yet, start it
          if (silenceDuration >= SILENCE_DURATION_MS && !isGracePeriodRef.current) {
            startGracePeriod();
          }
        }
      }
      
      // Continue monitoring
      if (isRecording) {
        vadRef.current = setTimeout(checkVAD, checkInterval);
      }
    };
    
    vadRef.current = setTimeout(checkVAD, checkInterval);
  }, [isRecording, detectVoiceActivity, startGracePeriod, interruptGracePeriod]);
  
  // Start recording
  const start = useCallback(async () => {
    try {
      console.log('[GracePeriodRecorder] Starting recording');
      
      // Reset state
      audioChunksRef.current = [];
      setIsRecording(true);
      setIsInGracePeriod(false);
      setGraceSeconds(0);
      isGracePeriodRef.current = false;
      silenceStartRef.current = null;
      
      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });
      streamRef.current = stream;
      
      // Initialize audio context for VAD
      await initAudioContext(stream);
      
      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        console.log('[GracePeriodRecorder] MediaRecorder stopped');
      };
      
      // Start recording
      mediaRecorder.start(100); // Collect chunks every 100ms
      
      // Start VAD monitoring
      startVADMonitoring();
      
      // Play start recording chiptune
      chiptune.playStartRecording();
      
    } catch (err) {
      console.error('[GracePeriodRecorder] Failed to start recording:', err);
      setIsRecording(false);
    }
  }, [initAudioContext, startVADMonitoring]);
  
  // Stop recording manually
  const stop = useCallback(async () => {
    console.log('[GracePeriodRecorder] Stopping recording manually');
    
    if (vadRef.current) {
      clearTimeout(vadRef.current);
      vadRef.current = null;
    }
    
    await finalizeRecording();
  }, [finalizeRecording]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vadRef.current) clearTimeout(vadRef.current);
      if (graceTimerRef.current) clearInterval(graceTimerRef.current);
      if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  return {
    start,
    stop,
    isRecording,
    isInGracePeriod,
    graceSeconds,
  };
}

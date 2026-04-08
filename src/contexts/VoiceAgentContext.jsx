import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useOpenCode } from '../hooks/useOpenCode';
import { useTranscriber } from '../hooks/useTranscriber';
import { useHeyBuddy } from '../hooks/useHeyBuddy';
import { useTTS } from '../hooks/useTTS';
import { useConversationStateMachine } from '../hooks/useConversationStateMachine';
import { useGracePeriodProcessor } from '../hooks/useGracePeriodProcessor';
import { useBargeInTTS } from '../hooks/useBargeInTTS';
import { useQuickListen } from '../hooks/useQuickListen';
import { HeyBuddy } from '../services/HeyBuddy';
import tts from '../services/tts';
import chiptune from '../services/chiptune';
import intentClassifier from '../services/intent';
import { WAKE_WORDS, COLORS } from '../App';

const VoiceAgentContext = createContext(null);

export const useVoiceAgent = () => {
  const context = useContext(VoiceAgentContext);
  if (!context) {
    throw new Error('useVoiceAgent must be used within a VoiceAgentProvider');
  }
  return context;
};

// Extracted from App.jsx ModelLoader logic
const useModelLoader = (options) => {
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState({
    'Hey Buddy Wake Words': 0, 'Silero VAD': 0, 'Speech Embedding': 0,
    'Whisper Transcription': 0, 'FunctionGemma Intent': 0
  });
  const [status, setStatus] = useState('Checking cached models...');
  const [modelsReady, setModelsReady] = useState(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const loadModels = async () => {
      try {
        setStatus('Initializing Hey Buddy (WASM)...');
        const heyBuddy = new HeyBuddy(options);
        await heyBuddy.waitUntilReady();
        setProgress(prev => ({
          ...prev, 'Hey Buddy Wake Words': 100, 'Silero VAD': 100, 'Speech Embedding': 100
        }));
        setStatus('Whisper loads on-demand. Web Speech API ready.');
        setProgress(prev => ({ ...prev, 'Whisper Transcription': 100, 'FunctionGemma Intent': 100 }));
        setStatus('All systems GO!');
        setModelsReady(true);
        setIsLoading(false);
      } catch (err) {
        setStatus(`Error: ${err.message}. Check console.`);
        setIsLoading(false);
      }
    };
    loadModels();
  }, [options]);

  return { isLoading, progress, status, modelsReady };
};

const loadSettings = () => {
  try {
    const saved = localStorage.getItem('voice-agent-settings')
    if (saved) return JSON.parse(saved)
  } catch (e) {}
  return { tts: true, chiptune: true, voice: 'M1', forceWebSpeech: false }
}

const saveSettings = (settings) => {
  try { localStorage.setItem('voice-agent-settings', JSON.stringify(settings)) } catch (e) {}
}

export const VoiceAgentProvider = ({ children, heyBuddyOptions }) => {
  const [settings, setSettings] = useState(loadSettings);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [showCreateSessionPopup, setShowCreateSessionPopup] = useState(false);
  const [showTranscriptionError, setShowTranscriptionError] = useState(null);
  
  const lastMessageRef = useRef(null);
  const pendingMessageRef = useRef(null);
  const conversationStateRef = useRef('idle');
  const STATESRef = useRef({});
  const graceRecorderActiveRef = useRef(false);
  const processGracePeriodAudioRef = useRef(null);
  const handleWakeWordDetectedRef = useRef(null);
  const prevWakeWordsRef = useRef({});

  useEffect(() => { saveSettings(settings); }, [settings]);

  // Model loading
  const { isLoading: isModelsLoading, progress, status, modelsReady } = useModelLoader(heyBuddyOptions);

  // APIs
  const openCodeApi = useOpenCode();
  const ttsApi = useTTS();
  const transcriberApi = useTranscriber();
  
  useEffect(() => {
    if (transcriberApi.error) {
      setShowTranscriptionError(transcriberApi.error);
      const timer = setTimeout(() => setShowTranscriptionError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [transcriberApi.error]);

  const handleRecordingComplete = useCallback((audioSamples) => {
    if (graceRecorderActiveRef.current && processGracePeriodAudioRef.current) {
      processGracePeriodAudioRef.current(audioSamples);
      return;
    }
    const useWebSpeech = settings.forceWebSpeech || transcriberApi.transcriptionMethod === 'webspeech';
    if (useWebSpeech && transcriberApi.webSpeechSupported) {
      transcriberApi.transcribeWithWebSpeech('en-US');
    } else {
      transcriberApi.clear();
      transcriberApi.transcribe(audioSamples, 'en');
    }
    if (settings.chiptune) chiptune.playRecordingStart();
  }, [settings, transcriberApi]);

  const heyBuddyApi = useHeyBuddy(heyBuddyOptions, handleRecordingComplete);

  // Watch wake words
  useEffect(() => {
    const detectedWakeWord = Object.entries(heyBuddyApi.wakeWords).find(([_, active]) => active);
    const prevDetected = Object.entries(prevWakeWordsRef.current).find(([_, active]) => active);
    if (detectedWakeWord && !prevDetected && handleWakeWordDetectedRef.current) {
      handleWakeWordDetectedRef.current();
    }
    prevWakeWordsRef.current = { ...heyBuddyApi.wakeWords };
  }, [heyBuddyApi.wakeWords]);



  const conversationMachine = useConversationStateMachine({
    onStateChange: (newState) => {
      conversationStateRef.current = newState;
    },
    onGracePeriodTick: (seconds) => {
      if (seconds === 5 && settings.chiptune) chiptune.playGracePeriodReset();
    },
    onQuickListenTick: () => {},
  });

  useEffect(() => { STATESRef.current = conversationMachine.STATES; }, [conversationMachine.STATES]);

  const graceProcessor = useGracePeriodProcessor({
    onComplete: async (audioBuffer) => {
      heyBuddyApi.stopRecording();
      graceRecorderActiveRef.current = false;
      if (!audioBuffer) {
        conversationMachine.resetToIdle();
        return;
      }
      conversationMachine.startTranscribing();
      try {
        const audioData = audioBuffer.getChannelData(0);
        transcriberApi.clear();
        transcriberApi.transcribe(audioData, 'en');
      } catch (err) {
        console.error('Transcription error:', err);
        conversationMachine.resetToIdle();
      }
    },
    onGraceTick: (seconds) => {
      if (seconds < 5 && conversationMachine.state === conversationMachine.STATES.RECORDING) {
        conversationMachine.startGracePeriod();
      }
    },
    onInterrupt: () => { conversationMachine.interruptGracePeriod(); },
  });

  useEffect(() => {
    if (conversationMachine.state === conversationMachine.STATES.IDLE) {
      heyBuddyApi.stopRecording();
    }
  }, [conversationMachine.state, conversationMachine.STATES.IDLE, heyBuddyApi.stopRecording]);

  useEffect(() => { processGracePeriodAudioRef.current = graceProcessor.processAudio; }, [graceProcessor.processAudio]);

  const bargeInApi = useBargeInTTS({
    onBargeIn: (command) => {
      conversationMachine.onBargeIn(command);
      if (command === 'stop') {
        bargeInApi.stop();
        startQuickListenTimer();
      } else if (command === 'pause') {
        bargeInApi.pause();
      }
    },
    onComplete: () => {
      conversationMachine.onSpeakingComplete();
      startQuickListenTimer();
    },
    onParagraph: (index) => { conversationMachine.updateParagraph(index); },
  });

  const handleQuickListenMessage = useCallback(async (text) => {
    if (!text.trim() || !openCodeApi.connected || !openCodeApi.selectedSession) return;
    const intent = await intentClassifier.classify(text);
    if (intent.type === 'command' && (intent.action === '/interrupt' || intent.action === '/stop')) {
      conversationMachine.resetToIdle();
      graceRecorderActiveRef.current = false;
      graceProcessor.resetState();
      return;
    }
    conversationMachine.startSending();
    try {
      await openCodeApi.sendMessage(text);
    } catch (err) {
      conversationMachine.resetToIdle();
      graceRecorderActiveRef.current = false;
      graceProcessor.resetState();
    }
  }, [openCodeApi, conversationMachine, graceProcessor]);

  const quickListenApi = useQuickListen({
    duration: 15000,
    onTranscript: (text) => {
      conversationMachine.onQuickListenTranscript(text);
      handleQuickListenMessage(text);
    },
    onTimeout: () => {
      conversationMachine.resetToIdle();
      graceRecorderActiveRef.current = false;
      graceProcessor.resetState();
    },
    onCancel: () => {
      conversationMachine.cancelQuickListen();
      graceRecorderActiveRef.current = false;
      graceProcessor.resetState();
    },
  });

  const startQuickListenTimer = useCallback(() => {
    if (settings.chiptune) chiptune.playStartRecording();
    quickListenApi.start();
  }, [settings.chiptune, quickListenApi]);

  const handleWakeWordDetected = useCallback(() => {
    if (conversationMachine.state === conversationMachine.STATES.IDLE || conversationMachine.state === conversationMachine.STATES.QUICK_LISTEN) {
      if (conversationMachine.state === conversationMachine.STATES.QUICK_LISTEN) {
        quickListenApi.stop();
        graceProcessor.resetState();
      }
      if (settings.chiptune) chiptune.playWakeWordDetected();
      graceRecorderActiveRef.current = true;
      conversationMachine.startRecording();
    }
  }, [conversationMachine, quickListenApi, settings.chiptune, graceProcessor]);

  useEffect(() => { handleWakeWordDetectedRef.current = handleWakeWordDetected; }, [handleWakeWordDetected]);

  useEffect(() => {
    const transcript = transcriberApi.transcript;
    if (transcript?.text && !transcript.isBusy && conversationMachine.state === conversationMachine.STATES.TRANSCRIBING) {
      const text = transcript.text;
      const isNoise = [/foreign language/i, /upbeat music/i, /\[music\]/i, /\[silence\]/i, /thank you for watching/i].some(p => p.test(text));
      
      if (isNoise) {
        conversationMachine.resetToIdle();
        graceRecorderActiveRef.current = false;
        graceProcessor.resetState();
        transcriberApi.clear();
        return;
      }

      let cleanedText = text;
      for (const wakeWord of WAKE_WORDS) {
        const regex = new RegExp(`^\\s*${wakeWord}[,\\s]*`, 'i');
        cleanedText = cleanedText.replace(regex, '').trim();
      }
      
      if (!openCodeApi.connected) {
        if (settings.chiptune) chiptune.playError?.();
        conversationMachine.resetToIdle();
        graceRecorderActiveRef.current = false;
        graceProcessor.resetState();
        transcriberApi.clear();
        return;
      }
      
      if (!openCodeApi.selectedSession) {
        pendingMessageRef.current = cleanedText;
        setShowCreateSessionPopup(true);
        conversationMachine.resetToIdle();
        graceRecorderActiveRef.current = false;
        graceProcessor.resetState();
        transcriberApi.clear();
        return;
      }
      
      if (cleanedText) {
        conversationMachine.startSending();
        openCodeApi.sendMessage(cleanedText).then(() => {
          if (settings.chiptune) chiptune.playSuccess();
          graceRecorderActiveRef.current = false;
          graceProcessor.resetState();
        }).catch((err) => {
          if (settings.chiptune) chiptune.playError();
          conversationMachine.resetToIdle();
          graceRecorderActiveRef.current = false;
          graceProcessor.resetState();
        });
      } else {
        conversationMachine.resetToIdle();
        graceRecorderActiveRef.current = false;
        graceProcessor.resetState();
      }
      transcriberApi.clear();
    }
  }, [transcriberApi.transcript, conversationMachine, openCodeApi, settings.chiptune, graceProcessor, transcriberApi]);

  useEffect(() => {
    const lastMsg = openCodeApi.messages[openCodeApi.messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.id !== lastMessageRef.current) {
      lastMessageRef.current = lastMsg.id;
      if (settings.tts && lastMsg.content) {
        const paragraphs = lastMsg.content.split(/\n\n+|(?<=[.!?])\s+(?=[A-Z])/).map(p => p.trim()).filter(p => p.length > 0);
        conversationMachine.startSpeaking(paragraphs.length);
        bargeInApi.speakParagraphs(lastMsg.content);
      }
    }
  }, [openCodeApi.messages, settings.tts, conversationMachine, bargeInApi]);

  const combinedMessages = useMemo(() => {
    return [...openCodeApi.messages];
  }, [openCodeApi.messages]);

  useEffect(() => {
    if (transcriberApi.isTranscribing || ttsApi.isSpeaking || !openCodeApi.connected) {
      heyBuddyApi.pause();
    } else {
      heyBuddyApi.resume();
    }
  }, [transcriberApi.isTranscribing, ttsApi.isSpeaking, openCodeApi.connected, heyBuddyApi]);

  useEffect(() => {
    if (modelsReady && heyBuddyApi.permissionStatus === 'prompt') {
      setShowPermissionPrompt(true);
    }
  }, [modelsReady, heyBuddyApi.permissionStatus]);

  const handleAllowMicrophone = useCallback(async () => {
    const granted = await heyBuddyApi.requestMicrophonePermission();
    if (granted) {
      setShowPermissionPrompt(false);
      await heyBuddyApi.start();
    }
  }, [heyBuddyApi]);

  const activeWakeWords = useMemo(() => {
    const active = [];
    for (const word of WAKE_WORDS) {
      const key = word.replace(' ', '-');
      if (heyBuddyApi.wakeWords[key]?.active) active.push(word);
    }
    return active;
  }, [heyBuddyApi.wakeWords]);

  const handleCreateSessionAndSend = useCallback(async () => {
    try {
      const newSession = await openCodeApi.createSession(`Voice Session ${openCodeApi.sessions.length + 1}`);
      if (newSession && pendingMessageRef.current) {
        await openCodeApi.sendMessage(pendingMessageRef.current, { sessionId: newSession.id });
        pendingMessageRef.current = null;
        setShowCreateSessionPopup(false);
        if (settings.chiptune) chiptune.playSuccess();
      }
    } catch (err) {
      if (settings.chiptune) chiptune.playError();
    }
  }, [openCodeApi, settings.chiptune]);

  const handleCancelCreateSession = useCallback(() => {
    pendingMessageRef.current = null;
    setShowCreateSessionPopup(false);
    graceRecorderActiveRef.current = false;
    graceProcessor.resetState();
    conversationMachine.resetToIdle();
  }, [graceProcessor, conversationMachine]);

  const handleToggle = useCallback((key, value) => {
    if (key === 'voice') {
      setSettings(s => ({ ...s, voice: value }));
      tts.setVoice(value);
    } else if (key === 'forceWebSpeech') {
      setSettings(s => ({ ...s, forceWebSpeech: !s.forceWebSpeech }));
    } else {
      setSettings(s => ({ ...s, [key]: !s[key] }));
    }
  }, []);

  const value = {
    settings, handleToggle,
    isModelsLoading, modelsReady, progress, status,
    showPermissionPrompt, setShowPermissionPrompt, handleAllowMicrophone,
    showCreateSessionPopup, handleCreateSessionAndSend, handleCancelCreateSession, pendingMessageRef,
    showTranscriptionError,
    
    // Extracted API state
    openCodeApi,
    ttsApi,
    transcriberApi,
    heyBuddyApi,
    conversationMachine,
    graceProcessor,
    bargeInApi,
    quickListenApi,
    
    combinedMessages,
    activeWakeWords,
  };

  return <VoiceAgentContext.Provider value={value}>{children}</VoiceAgentContext.Provider>;
};

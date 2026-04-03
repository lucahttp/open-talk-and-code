import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useOpenCode } from './hooks/useOpenCode'
import { useTranscriber } from './hooks/useTranscriber'
import { useHeyBuddy } from './hooks/useHeyBuddy'
import { useAudioVisualization, useMultiLineVisualization } from './hooks/useAudioVisualization'
import { useTTS } from './hooks/useTTS'
import { HeyBuddy } from './services/HeyBuddy'
import { pipeline, env, AutoTokenizer, AutoModelForCausalLM } from '@huggingface/transformers'
import tts from './services/tts'
import chiptune from './services/chiptune'
import gsap from 'gsap'
import './index.css'

// Configure HuggingFace environment
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || null

// Configure transformers.js cache
env.allowLocalModels = true
env.allowRemoteModels = true
env.useBrowserCache = true
env.cacheDir = '/models'

// Log token status
if (HF_TOKEN) {
  console.log('[HF] Token configured - will use for gated models')
} else {
  console.log('[HF] No token configured - gated models may fail with 401')
}

// Hey Buddy Configuration - Models hosted on HuggingFace
const ROOT_URL = "https://huggingface.co/benjamin-paine/hey-buddy/resolve/main";
export const WAKE_WORDS = ["buddy", "hey buddy", "hi buddy", "sup buddy", "yo buddy", "okay buddy", "hello buddy"];

export const COLORS = {
  "buddy": [0, 119, 187],
  "hey buddy": [0, 153, 136],
  "hi buddy": [51, 227, 138],
  "sup buddy": [238, 119, 51],
  "yo buddy": [204, 51, 217],
  "okay buddy": [238, 51, 119],
  "hello buddy": [184, 62, 104],
  "speech": [22, 200, 206],
  "frame budget": [25, 255, 25],
};

const heyBuddyOptions = {
  debug: false,
  modelPath: WAKE_WORDS.map((word) => `${ROOT_URL}/models/${word.replace(' ', '-')}.onnx`),
  vadModelPath: `${ROOT_URL}/pretrained/silero-vad.onnx`,
  spectrogramModelPath: `${ROOT_URL}/pretrained/mel-spectrogram.onnx`,
  embeddingModelPath: `${ROOT_URL}/pretrained/speech-embedding.onnx`,
};

// Loading Screen Component - Shows progress of model downloads
const LoadingScreen = ({ progress, status, onComplete }) => {
  const totalModels = 5; // Hey Buddy models + Whisper + FunctionGemma
  const completedModels = Object.values(progress).filter(p => p === 100).length;
  const totalProgress = Object.values(progress).reduce((sum, p) => sum + p, 0) / totalModels;
  
  // Check Web Speech API support
  const webSpeechSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  
  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50">
      <pre className="ascii-header text-[10px] leading-[1.2] text-terminal mb-8 select-none">
{`╔═══════════════════════════════════════════════════════════════╗
║  ██╗   ██╗ ██████╗ ██╗ ██████╗███████╗                       ║
║  ██║   ██║██╔═══██╗██║██╔════╝██╔════╝                       ║
║  ██║   ██║██║   ██║██║██║     █████╗                         ║
║  ╚██╗ ██╔╝██║   ██║██║██║     ██╔══╝                         ║
║   ╚████╔╝ ╚██████╔╝██║╚██████╗██║                            ║
║    ╚═══╝   ╚═════╝ ╚═╝ ╚═════╝╚═╝     ███████╗ ██████╗ ███████║
║                                       ██╔════╝██╔═══██╗██╔════╝
║                                       ██║     ██║   ██║███████╗
║                                       ██║     ██║   ██║╚════██║
║                                       ╚██████╗╚██████╔╝███████║
║                                        ╚═════╝ ╚═════╝ ╚══════╝
╚═══════════════════════════════════════════════════════════════╝`}
      </pre>
      
      <div className="w-96 border border-terminal p-4 bg-black">
        <div className="text-terminal text-sm mb-2 font-mono">
          INITIALIZING AI MODELS...
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-4 border border-terminal bg-black mb-4">
          <div 
            className="h-full bg-terminal transition-all duration-300"
            style={{ width: `${Math.round(totalProgress)}%` }}
          />
        </div>
        
        <div className="text-terminal text-xs font-mono mb-4">
          {Math.round(totalProgress)}% Complete ({completedModels}/{totalModels} models)
        </div>
        
        {/* Individual Model Status */}
        <div className="space-y-1 text-xs font-mono">
          {Object.entries(progress).map(([name, p]) => (
            <div key={name} className="flex justify-between">
              <span className={p === 100 ? 'text-terminal' : 'text-gray-500'}>
                {p === 100 ? '✓' : '⏳'} {name}
              </span>
              <span className={p === 100 ? 'text-terminal' : 'text-gray-500'}>
                {p}%
              </span>
            </div>
          ))}
        </div>
        
        {/* Fallback Status */}
        <div className="mt-3 pt-2 border-t border-gray-700">
          <div className="text-gray-500 text-xs font-mono mb-1">FALLBACK METHODS:</div>
          <div className={`text-xs font-mono ${webSpeechSupported ? 'text-terminal' : 'text-red-500'}`}>
            {webSpeechSupported ? '✓ Web Speech API (browser built-in)' : '✗ Web Speech API (not supported)'}
          </div>
          <div className="text-terminal text-xs font-mono">
            ✓ Regex Intent Classification (always available)
          </div>
        </div>
        
        <div className="mt-4 text-gray-500 text-xs font-mono">
          {status}
        </div>
      </div>
    </div>
  );
};

// Components
const ASCIIHeader = () => (
  <pre className="ascii-header text-[10px] leading-[1.2] text-terminal mb-4 select-none">
{`╔═══════════════════════════════════════════════════════════════╗
║  ██╗   ██╗ ██████╗ ██╗ ██████╗███████╗                       ║
║  ██║   ██║██╔═══██╗██║██╔════╝██╔════╝                       ║
║  ██║   ██║██║   ██║██║██║     █████╗                         ║
║  ╚██╗ ██╔╝██║   ██║██║██║     ██╔══╝                         ║
║   ╚████╔╝ ╚██████╔╝██║╚██████╗██║                            ║
║    ╚═══╝   ╚═════╝ ╚═╝ ╚═════╝╚═╝     ███████╗ ██████╗ ███████║
║                                       ██╔════╝██╔═══██╗██╔════╝
║                                       ██║     ██║   ██║███████╗
║                                       ██║     ██║   ██║╚════██║
║                                       ╚██████╗╚██████╔╝███████║
║                                        ╚═════╝ ╚═════╝ ╚══════╝
╚═══════════════════════════════════════════════════════════════╝`}
  </pre>
)

// Activity Status Component - Shows real-time OpenCode activity
const ActivityStatus = ({ activity }) => {
  if (!activity) return null;
  
  const getIcon = () => {
    switch (activity.type) {
      case 'thinking': return '🧠';
      case 'generating': return '✨';
      case 'processing': return '⚙️';
      case 'tool': return '🔧';
      case 'command': return '⌨️';
      case 'sending': return '📤';
      default: return '⏳';
    }
  };
  
  return (
    <div className="flex items-center gap-2 text-xs text-cyan-400 animate-pulse border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 rounded">
      <span>{getIcon()}</span>
      <span className="font-mono">{activity.message}</span>
      <span className="inline-flex">
        <span className="animate-bounce">.</span>
        <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
        <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
      </span>
    </div>
  );
};

const StatusBar = ({ 
  connected, 
  sessionName, 
  isListening,
  isRecording,
  isSpeaking,
  isTranscribing,
  isGenerating,
  isProcessing,
  ttsEnabled,
  activeWakeWords,
  activity,
  transcriptionMethod,
  webSpeechSupported
}) => {
  const getStatus = () => {
    if (isRecording) return { icon: '🔴', text: 'RECORDING', color: 'text-red-500' };
    if (isTranscribing) return { 
      icon: '📝', 
      text: transcriptionMethod === 'webspeech' ? 'TRANSCRIBING (Web Speech)' : 'TRANSCRIBING (Whisper)', 
      color: 'text-cyan-400' 
    };
    if (isProcessing || isGenerating) return { icon: '⚡', text: 'PROCESSING', color: 'text-cyan-400 animate-pulse' };
    if (isSpeaking) return { icon: '🔊', text: 'SPEAKING', color: 'text-orange-400' };
    if (isListening && activeWakeWords.length > 0) return { 
      icon: '🎯', 
      text: `HEY ${activeWakeWords[0].toUpperCase()}!`, 
      color: 'text-terminal animate-pulse' 
    };
    if (isListening) return { icon: '👂', text: 'LISTENING', color: 'text-terminal animate-pulse' };
    return { icon: '🔇', text: 'IDLE', color: 'text-gray-500' };
  };
  
  const status = getStatus();
  
  return (
    <div className="flex items-center justify-between border border-gray-600 p-2 mb-2 bg-black">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-lg ${status.color}`}>
          {status.icon}
        </span>
        <span className={`text-sm ${status.color}`}>
          {status.text}
        </span>
        {activity && <ActivityStatus activity={activity} />}
        {transcriptionMethod === 'webspeech' && (
          <span className="text-xs text-yellow-400 ml-2" title="Using browser Web Speech API (Whisper unavailable)">
            [FALLBACK]
          </span>
        )}
        {ttsEnabled && (
          <span className="text-xs text-orange-400 ml-2">
            [TTS]
          </span>
        )}
        {!connected && (
          <span className="text-xs text-red-500 ml-2">
            [DISCONNECTED]
          </span>
        )}
      </div>
      <div className="text-xs text-terminal">
        {connected ? `CONNECTED: ${sessionName || 'NONE'}` : 'OFFLINE'}
      </div>
    </div>
  )
}

const SessionList = ({ sessions, selectedId, onSelect, onCreate, loading }) => (
  <div className="border border-gray-600 p-2 mb-4 bg-black">
    <div className="text-xs text-terminal mb-2 pb-1 border-b border-gray-600">
      ┌─ SESSIONS ─────────────────────────────┐
    </div>
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {loading ? (
        <div className="text-xs text-gray-500 italic">
          Loading...
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-xs text-gray-500 italic">
          No sessions found
        </div>
      ) : (
        sessions.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left text-xs p-1 border ${
              selectedId === s.id 
                ? 'border-terminal bg-terminal/10 text-terminal' 
                : 'border-gray-600 text-gray-400 hover:border-terminal hover:text-terminal'
            }`}
          >
            {selectedId === s.id ? '▶' : ' '} {s.title || s.id}
          </button>
        ))
      )}
    </div>
    <button
      onClick={onCreate}
      disabled={loading}
      className="w-full mt-2 text-xs border border-terminal text-terminal p-1 
                 hover:bg-terminal hover:text-black transition-colors disabled:opacity-50"
    >
      + NEW SESSION
    </button>
  </div>
)

const ChatLog = ({ messages, isProcessing, activity, streamingContent }) => {
  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)
  const [expandedReasoning, setExpandedReasoning] = useState(new Set())

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages, streamingContent, activity])

  // Check if last message is from user (waiting for response)
  const lastMessageIsUser = messages.length > 0 && messages[messages.length - 1]?.role === 'user'

  // Check if we have a streaming message
  const lastMessage = messages[messages.length - 1]
  const isStreaming = lastMessage?.streaming || (isProcessing && streamingContent)

  // Get detailed status message
  const getStatusMessage = () => {
    if (activity) {
      return activity.message;
    }
    if (isProcessing || lastMessageIsUser) {
      return 'Processing request...';
    }
    return null;
  };

  const statusMessage = getStatusMessage();

  // Toggle reasoning visibility
  const toggleReasoning = (msgId) => {
    setExpandedReasoning(prev => {
      const newSet = new Set(prev)
      if (newSet.has(msgId)) {
        newSet.delete(msgId)
      } else {
        newSet.add(msgId)
      }
      return newSet
    })
  }

  // Extract reasoning text from parts
  const getReasoningText = (parts) => {
    if (!parts) return ''
    return parts
      .filter(p => p.type === 'reasoning')
      .map(p => p.reasoning || p.text || '')
      .join(' ')
  }

  return (
    <div
      ref={containerRef}
      className="border border-gray-600 p-2 mb-4 bg-black flex-1 overflow-y-auto min-h-0"
    >
      <div className="text-xs text-terminal mb-2 pb-1 border-b border-gray-600 sticky top-0 bg-black">
        ┌─ CHAT LOG ({messages.length} messages) ─┐
      </div>
      <div className="space-y-3">
        {messages.length === 0 ? (
          <div className="text-xs text-gray-500 italic text-center py-8">
            Say &quot;Hey Buddy&quot; to start a conversation
          </div>
        ) : (
          messages.map((m, i) => {
            const reasoningText = getReasoningText(m.parts)
            const hasReasoning = reasoningText.length > 0
            const isExpanded = expandedReasoning.has(m.id)

            return (
              <div
                key={m.id || `msg_${i}`}
                className="text-xs animate-in fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className={`font-bold ${m.role === 'user' ? 'text-terminal' : 'text-cyan-400'}`}>
                  {m.role === 'user' ? '> YOU' : 'AI:'}
                </div>
                <div className={`pl-2 ${m.role === 'user' ? 'text-terminal' : 'text-gray-300'} whitespace-pre-wrap font-mono leading-relaxed`}>
                  {/* For the last assistant message during streaming, show streamingContent */}
                  {m.role === 'assistant' && i === messages.length - 1 && streamingContent
                    ? <>{streamingContent}<span className="animate-pulse">▌</span></>
                    : (m.content || '')
                  }
                </div>

                {/* Expandable reasoning section */}
                {hasReasoning && (
                  <div className="mt-1">
                    <button
                      onClick={() => toggleReasoning(m.id)}
                      className="pl-2 text-xs text-gray-500 hover:text-terminal flex items-center gap-1 transition-colors"
                    >
                      <span>{isExpanded ? '▼' : '▶'}</span>
                      <span className="italic">
                        {isExpanded ? 'Hide thinking process' : 'Show thinking process'}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="ml-4 mt-1 pl-2 border-l-2 border-gray-600 text-gray-500 italic whitespace-pre-wrap">
                        {reasoningText}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
        
        {/* Show detailed status indicator when processing */}
        {/* Status indicator */}
        {(isProcessing || isStreaming) && (
          <div className="border border-terminal/30 bg-terminal/5 p-2">
            <div className="text-xs text-terminal flex items-center gap-2">
              <span className="animate-pulse">⚡</span>
              <span className="font-mono">{statusMessage || 'Generating...'}</span>
              <span className="inline-flex">
                <span className="animate-bounce">.</span>
                <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
              </span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}

const Controls = ({ settings, onToggle, transcriptionMethod, webSpeechSupported }) => (
  <div className="flex items-center justify-between text-xs border-t border-gray-600 pt-2 mt-2">
    <div className="flex gap-4">
      <button 
        onClick={() => onToggle('tts')}
        className={`${settings.tts ? 'text-terminal' : 'text-gray-500'}`}
      >
        [TTS: {settings.tts ? 'ON' : 'OFF'}]
      </button>
      <button 
        onClick={() => onToggle('chiptune')}
        className={`${settings.chiptune ? 'text-terminal' : 'text-gray-500'}`}
      >
        [SFX: {settings.chiptune ? 'ON' : 'OFF'}]
      </button>
      {webSpeechSupported && (
        <button 
          onClick={() => onToggle('forceWebSpeech')}
          className={`${settings.forceWebSpeech ? 'text-yellow-400' : transcriptionMethod === 'webspeech' ? 'text-yellow-400' : 'text-gray-500'}`}
          title={transcriptionMethod === 'webspeech' ? 'Using Web Speech API (Whisper unavailable)' : settings.forceWebSpeech ? 'Forced Web Speech API' : 'Using Whisper'}
        >
          [STT: {settings.forceWebSpeech || transcriptionMethod === 'webspeech' ? 'Web Speech' : 'Whisper'}]
        </button>
      )}
    </div>
    <select 
      value={settings.voice}
      onChange={(e) => onToggle('voice', e.target.value)}
      className="bg-black border border-terminal text-terminal text-xs p-1"
    >
      {['M1','M2','M3','M4','M5','F1','F2','F3','F4','F5'].map(v => (
        <option key={v} value={v}>{v}</option>
      ))}
    </select>
  </div>
)

// Wake Word Visualizer Component
const WakeWordVisualizer = ({ wakeWords }) => {
  const canvasRef = useRef(null);
  
  const colors = useMemo(() => {
    const c = {};
    for (const word of WAKE_WORDS) {
      c[word] = COLORS[word];
    }
    return c;
  }, []);
  
  const { pushValue, draw } = useMultiLineVisualization(canvasRef, colors);
  
  useEffect(() => {
    for (const word of WAKE_WORDS) {
      const key = word.replace(' ', '-');
      const probability = wakeWords[key]?.probability || 0;
      pushValue(word, probability);
    }
    draw();
  }, [wakeWords, pushValue, draw]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={100} 
      className="border border-gray-600 bg-black/50"
    />
  );
};

// Speech Visualizer Component
const SpeechVisualizer = ({ probability }) => {
  const canvasRef = useRef(null);
  
  const { pushValue, draw } = useAudioVisualization(
    canvasRef,
    { color: COLORS.speech }
  );
  
  useEffect(() => {
    pushValue(probability);
    draw();
  }, [probability, pushValue, draw]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={50} 
      className="border border-gray-600 bg-black/50"
    />
  );
};

// Hook to preload all models with progress tracking
const useModelLoader = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState({
    'Hey Buddy Wake Words': 0,
    'Silero VAD': 0,
    'Speech Embedding': 0,
    'Whisper Transcription': 0,
    'FunctionGemma Intent': 0
  });
  const [status, setStatus] = useState('Checking cached models...');
  const [modelsReady, setModelsReady] = useState(false);

  useEffect(() => {
    const loadModels = async () => {
      const errors = [];
      
      try {
        // Step 1: Hey Buddy
        console.log('[ModelLoader] Step 1/5: Loading Hey Buddy...');
        setStatus('Loading Hey Buddy models...');
        
        const heyBuddy = new HeyBuddy({
          ...heyBuddyOptions,
          debug: false
        });
        
        setProgress(prev => ({
          ...prev,
          'Hey Buddy Wake Words': 25,
          'Silero VAD': 25,
          'Speech Embedding': 25
        }));
        
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('[ModelLoader] ✓ Hey Buddy initialized');
        
        // Step 2: Whisper (skip preload - will load on demand or use Web Speech API fallback)
        console.log('[ModelLoader] Step 2/5: Skipping Whisper preload (will load on demand or use Web Speech API fallback)');
        setStatus('Whisper will load on demand (Web Speech API fallback ready)...');
        setProgress(prev => ({ ...prev, 'Whisper Transcription': 100 }));
        
        // Check Web Speech API support
        const webSpeechSupported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
        console.log('[ModelLoader] Web Speech API supported:', webSpeechSupported);

        // Step 3: FunctionGemma Intent (Optional - uses regex fallback if fails)
        console.log('[ModelLoader] Step 3/5: Skipping FunctionGemma preload (will lazy-load if needed)');
        setStatus('FunctionGemma will load on-demand...');
        console.log('[ModelLoader] ℹ️ Intent classification uses regex fallback by default');
        
        setProgress(prev => ({ ...prev, 'FunctionGemma Intent': 100 }));
        
        // Mark Hey Buddy as complete
        setProgress(prev => ({
          ...prev,
          'Hey Buddy Wake Words': 100,
          'Silero VAD': 100,
          'Speech Embedding': 100
        }));
        
        if (errors.length > 0) {
          console.warn('[ModelLoader] Completed with errors:', errors);
          setStatus(`Loaded with ${errors.length} warning(s). Check console.`);
        } else {
          setStatus('All models ready!');
        }
        
        setModelsReady(true);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsLoading(false);
        
      } catch (err) {
        console.error('[ModelLoader] Fatal error:', err);
        setStatus(`Error: ${err.message}. Retrying in 3s...`);
        setTimeout(() => loadModels(), 3000);
      }
    };

    loadModels();
  }, []);

  return { isLoading, progress, status, modelsReady };
};

// Load settings from localStorage
const loadSettings = () => {
  try {
    const saved = localStorage.getItem('voice-agent-settings')
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (e) {
    console.log('Failed to load settings:', e)
  }
  return {
    tts: true,
    chiptune: true,
    voice: 'M1',
    forceWebSpeech: false
  }
}

// Save settings to localStorage
const saveSettings = (settings) => {
  try {
    localStorage.setItem('voice-agent-settings', JSON.stringify(settings))
  } catch (e) {
    console.log('Failed to save settings:', e)
  }
}

// Main App
function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false)
  const lastMessageRef = useRef(null)
  const [showTranscriptionError, setShowTranscriptionError] = useState(null)

  // Persist settings to localStorage
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  // Load models on startup
  const { isLoading: isModelsLoading, progress, status, modelsReady } = useModelLoader();

  // OpenCode connection
  const {
    connected,
    connecting,
    error: apiError,
    sessions,
    selectedSession,
    messages,
    activity,
    isProcessing: isOpenCodeProcessing,
    streamingContent,
    createSession,
    selectSession,
    sendMessage,
    executeCommand,
    connect
  } = useOpenCode()

  // TTS Hook
  const { speak: browserSpeak, cancel: cancelTTS, isSpeaking } = useTTS();

  // Transcription hook
  const {
    transcript,
    isTranscribing,
    isModelLoading: isTranscriberLoading,
    progress: transcriptionProgress,
    error: transcriptionError,
    transcriptionMethod,
    transcribe,
    clear: clearTranscript,
    transcribeWithWebSpeech,
    webSpeechSupported,
  } = useTranscriber();

  // Show transcription errors
  useEffect(() => {
    if (transcriptionError) {
      setShowTranscriptionError(transcriptionError);
      const timer = setTimeout(() => setShowTranscriptionError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [transcriptionError]);

  // Track if we're using Web Speech API fallback
  const isWebSpeechFallback = transcriptionMethod === 'webspeech';

  // Handle recording complete from Hey Buddy
  const handleRecordingComplete = useCallback((audioSamples) => {
    console.log('Recording complete, starting transcription...', audioSamples.length, 'samples');
    
    // Check if we should use Web Speech API (forced or fallback)
    const useWebSpeech = settings.forceWebSpeech || transcriptionMethod === 'webspeech';
    
    // If Whisper failed or forced to use Web Speech API, use it instead
    if (useWebSpeech && webSpeechSupported) {
      console.log('[App] Using Web Speech API for transcription');
      // Web Speech API will be started via transcribeWithWebSpeech
      // We need to trigger it here since we can't use the audio samples
      transcribeWithWebSpeech('en-US');
    } else {
      // Use Whisper (normal flow)
      clearTranscript();
      transcribe(audioSamples, 'en');
    }
    
    if (settings.chiptune) {
      chiptune.playRecordingStart();
    }
  }, [transcribe, clearTranscript, settings.chiptune, settings.forceWebSpeech, transcriptionMethod, webSpeechSupported, transcribeWithWebSpeech]);

  // Hey Buddy hook
  const {
    isInitialized,
    isRecording,
    isListening,
    speechProbability,
    wakeWords,
    permissionStatus,
    start,
    stop,
    pause,
    resume,
    requestMicrophonePermission,
  } = useHeyBuddy(heyBuddyOptions, handleRecordingComplete);

  // Track processed transcripts to avoid duplicates
  const processedTranscriptsRef = useRef(new Set());

  // Transcription -> OpenCode
  useEffect(() => {
    if (transcript?.text && !transcript.isBusy && connected && selectedSession) {
      const text = transcript.text;
      
      // Skip if we already processed this exact text
      if (processedTranscriptsRef.current.has(text)) {
        clearTranscript();
        return;
      }
      
      // Mark as processed
      processedTranscriptsRef.current.add(text);

      // Remove wake words from the beginning of the transcript
      let cleanedText = text;
      for (const wakeWord of WAKE_WORDS) {
        const regex = new RegExp(`^\\s*${wakeWord}[,\\s]*`, 'i');
        cleanedText = cleanedText.replace(regex, '').trim();
      }

      // Only send if there's actual content after removing wake word
      if (cleanedText) {
        console.log('Transcription complete, sending to OpenCode:', cleanedText);
        
        // Play chiptune processing sound
        if (settings.chiptune) {
          chiptune.playProcessing();
        }
        
        // Send to OpenCode
        sendMessage(cleanedText).then(() => {
          if (settings.chiptune) {
            chiptune.playSuccess();
          }
        }).catch((err) => {
          console.error('Failed to send:', err);
          if (settings.chiptune) {
            chiptune.playError();
          }
        });
      }
      
      // Clear transcript after processing
      clearTranscript();
    }
  }, [transcript, connected, selectedSession, sendMessage, clearTranscript, settings.chiptune]);

  // Pause listening during processing/speaking
  useEffect(() => {
    if (isTranscribing || isSpeaking || !connected) {
      pause();
    } else {
      resume();
    }
  }, [isTranscribing, isSpeaking, connected, pause, resume]);

  // Watch for new LLM responses and speak them
  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    
    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.id !== lastMessageRef.current) {
      lastMessageRef.current = lastMessage.id
      
      // Speak the response
      if (settings.tts && lastMessage.content) {
        browserSpeak(lastMessage.content);
      }
    }
  }, [messages, settings.tts, browserSpeak]);

  // Show permission prompt when models are ready
  useEffect(() => {
    if (modelsReady && permissionStatus === 'prompt') {
      setShowPermissionPrompt(true);
    }
  }, [modelsReady, permissionStatus]);

  // Permission handling
  const handleAllowMicrophone = useCallback(async () => {
    const granted = await requestMicrophonePermission();
    if (granted) {
      setShowPermissionPrompt(false);
      await start();
    }
  }, [requestMicrophonePermission, start]);

  // Active wake words
  const activeWakeWords = useMemo(() => {
    const active = [];
    for (const word of WAKE_WORDS) {
      const key = word.replace(' ', '-');
      if (wakeWords[key]?.active) {
        active.push(word);
      }
    }
    return active;
  }, [wakeWords]);

  // Handle wake word detection with chiptune
  useEffect(() => {
    if (activeWakeWords.length > 0 && settings.chiptune) {
      chiptune.playWakeWordDetected();
      
      // GSAP animation for border flash
      gsap.fromTo('.main-container',
        { 
          boxShadow: '0 0 0 4px #00ff00, inset 0 0 100px rgba(0, 255, 0, 0.2)'
        },
        { 
          boxShadow: '0 0 0 0px transparent, inset 0 0 0px transparent',
          duration: 0.6,
          ease: 'power2.out'
        }
      );
    }
  }, [activeWakeWords, settings.chiptune]);

  const handleCreateSession = useCallback(async () => {
    try {
      await createSession(`Voice Session ${sessions.length + 1}`)
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }, [createSession, sessions.length])

  const handleToggle = useCallback((key, value) => {
    if (key === 'voice') {
      setSettings(s => ({ ...s, voice: value }));
      tts.setVoice(value);
    } else if (key === 'forceWebSpeech') {
      setSettings(s => ({ ...s, forceWebSpeech: !s.forceWebSpeech }));
    } else {
      setSettings(s => ({ ...s, [key]: !s[key] }));
    }
  }, [])

  // Loading status
  const isLoading = isTranscriberLoading || connecting;

  // Show loading screen while models are loading
  if (isModelsLoading) {
    return <LoadingScreen progress={progress} status={status} />;
  }

  return (
    <div className="main-container w-full h-screen bg-black p-4 flex flex-col grid-bg relative overflow-hidden">
      <ASCIIHeader />
      
      <StatusBar 
        connected={connected}
        sessionName={selectedSession?.title || selectedSession?.id}
        isListening={isListening}
        isRecording={isRecording}
        isSpeaking={isSpeaking}
        isTranscribing={isTranscribing}
        isGenerating={false}
        isProcessing={isOpenCodeProcessing}
        ttsEnabled={settings.tts}
        activeWakeWords={activeWakeWords}
        activity={activity}
        transcriptionMethod={transcriptionMethod}
        webSpeechSupported={webSpeechSupported}
      />
      
      {isLoading && (
        <div className="text-xs text-terminal mb-2 animate-pulse">
          [LOADING AI MODELS... {Math.round(transcriptionProgress[0]?.progress || 0)}%]
        </div>
      )}
      
        {/* Transcription Error Toast */}
        {showTranscriptionError && (
          <div className="fixed top-4 right-4 z-50 border border-red-500 bg-black p-3 max-w-sm">
            <div className="text-red-500 text-sm font-bold mb-1">⚠️ Transcription Error</div>
            <div className="text-gray-400 text-xs">{showTranscriptionError}</div>
            {webSpeechSupported && transcriptionMethod !== 'webspeech' && (
              <div className="text-yellow-400 text-xs mt-2">
                Switching to Web Speech API fallback...
              </div>
            )}
            {!webSpeechSupported && (
              <div className="text-red-400 text-xs mt-2">
                Web Speech API not available in this browser.
              </div>
            )}
          </div>
        )}

      {/* Visualizers */}
      {isInitialized && (
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-1">Wake Word Detection</div>
            <WakeWordVisualizer wakeWords={wakeWords} />
          </div>
          <div className="w-64">
            <div className="text-xs text-gray-500 mb-1">Speech Activity</div>
            <SpeechVisualizer probability={speechProbability} />
          </div>
        </div>
      )}
      
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-64 flex flex-col">
          <SessionList 
            sessions={sessions}
            selectedId={selectedSession?.id}
            onSelect={selectSession}
            onCreate={handleCreateSession}
            loading={connecting}
          />
          
          <div className="text-xs text-gray-500 mt-auto">
            <div className="border border-gray-600 p-2">
              <div className="text-terminal mb-1">┌─ HELP ─┐</div>
              <div>Say &quot;Hey Buddy&quot;</div>
              <div>Or any wake word</div>
              <div className="text-gray-600 mt-1">v2.0.0 (Mortimer)</div>
              {!connected && (
                <button 
                  onClick={connect}
                  className="mt-2 text-terminal border border-terminal px-2 py-1 hover:bg-terminal hover:text-black"
                >
                  [RECONNECT]
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Main area */}
        <div className="flex-1 flex flex-col min-h-0">
          <ChatLog 
            messages={messages} 
            isProcessing={isOpenCodeProcessing}
            activity={activity}
            streamingContent={streamingContent}
          />
          
          <Controls 
            settings={settings} 
            onToggle={handleToggle}
            transcriptionMethod={transcriptionMethod}
            webSpeechSupported={webSpeechSupported}
          />
        </div>
      </div>
      
      {/* Permission Prompt */}
      {showPermissionPrompt && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="border-2 border-terminal p-6 max-w-md bg-black">
            <h2 className="text-terminal text-lg font-bold mb-4">Microphone Permission Required</h2>
            <p className="text-gray-400 text-sm mb-4">
              This voice agent needs microphone access to detect wake words (&quot;Hey Buddy&quot;) 
              and record your voice commands.
            </p>
            <div className="flex gap-4">
              <button
                onClick={handleAllowMicrophone}
                className="flex-1 border border-terminal text-terminal py-2 hover:bg-terminal hover:text-black"
              >
                ALLOW MICROPHONE
              </button>
              <button
                onClick={() => setShowPermissionPrompt(false)}
                className="flex-1 border border-gray-600 text-gray-400 py-2 hover:border-red-500 hover:text-red-500"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

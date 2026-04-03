import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useOpenCode } from './hooks/useOpenCode'
import { useTranscriber } from './hooks/useTranscriber'
import { useHeyBuddy } from './hooks/useHeyBuddy'
import { useAudioVisualization, useMultiLineVisualization } from './hooks/useAudioVisualization'
import { useTTS } from './hooks/useTTS'
import tts from './services/tts'
import chiptune from './services/chiptune'
import gsap from 'gsap'
import './index.css'

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

const StatusBar = ({ 
  connected, 
  sessionName, 
  isListening,
  isRecording,
  isSpeaking,
  isTranscribing,
  isGenerating,
  ttsEnabled,
  activeWakeWords
}) => {
  const getStatus = () => {
    if (isRecording) return { icon: '🔴', text: 'RECORDING', color: 'text-red-500' };
    if (isTranscribing) return { icon: '📝', text: 'TRANSCRIBING', color: 'text-cyan-400' };
    if (isGenerating) return { icon: '🧠', text: 'THINKING', color: 'text-cyan-400' };
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
    <div className="flex items-center justify-between border border-gray-600 p-2 mb-4 bg-black">
      <div className="flex items-center gap-2">
        <span className={`text-lg ${status.color}`}>
          {status.icon}
        </span>
        <span className={`text-sm ${status.color}`}>
          {status.text}
        </span>
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

const ChatLog = ({ messages, isProcessing }) => {
  const messagesEndRef = useRef(null)
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  
  return (
    <div className="border border-gray-600 p-2 mb-4 bg-black flex-1 overflow-y-auto min-h-0">
      <div className="text-xs text-terminal mb-2 pb-1 border-b border-gray-600 sticky top-0 bg-black">
        ┌─ CHAT LOG ─────────────────────────────┐
      </div>
      <div className="space-y-2">
        {messages.length === 0 ? (
          <div className="text-xs text-gray-500 italic text-center py-8">
            Say &quot;Hey Buddy&quot; to start
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={m.id || i} className="text-xs animate-in fade-in slide-in-from-bottom-2">
              <div className={`font-bold ${m.role === 'user' ? 'text-terminal' : 'text-cyan-400'}`}>
                {m.role === 'user' ? '>' : 'AI:'}
              </div>
              <div className={`pl-2 ${m.role === 'user' ? 'text-terminal' : 'text-gray-300'}`}>
                {m.content || m.parts?.map(p => p.text).join(' ') || '[Processing...]'}
              </div>
            </div>
          ))
        )}
        {isProcessing && (
          <div className="text-xs text-cyan-400 animate-pulse">
            [Thinking...]
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}

const Controls = ({ settings, onToggle }) => (
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

// Main App
function App() {
  const [settings, setSettings] = useState({
    tts: true,
    chiptune: true,
    voice: 'M1'
  })
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(true)
  const lastMessageRef = useRef(null)

  // OpenCode connection
  const {
    connected,
    connecting,
    error: apiError,
    sessions,
    selectedSession,
    messages,
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
    transcribe,
    clear: clearTranscript,
  } = useTranscriber();

  // Handle recording complete from Hey Buddy
  const handleRecordingComplete = useCallback((audioSamples) => {
    console.log('Recording complete, starting transcription...', audioSamples.length, 'samples');
    clearTranscript();
    transcribe(audioSamples, 'en');
    
    if (settings.chiptune) {
      chiptune.playRecordingStart();
    }
  }, [transcribe, clearTranscript, settings.chiptune]);

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

  // Processed text ref to prevent duplicate processing
  const processedTextRef = useRef('');

  // Transcription -> OpenCode
  useEffect(() => {
    if (transcript?.text && !transcript.isBusy && connected && selectedSession) {
      if (processedTextRef.current === transcript.text) return;

      // Remove wake words from the beginning of the transcript
      let cleanedText = transcript.text;
      for (const wakeWord of WAKE_WORDS) {
        const regex = new RegExp(`^\\s*${wakeWord}[,\\s]*`, 'i');
        cleanedText = cleanedText.replace(regex, '').trim();
      }

      // Only send if there's actual content after removing wake word
      if (cleanedText) {
        console.log('Transcription complete, sending to OpenCode:', cleanedText);
        processedTextRef.current = transcript.text;
        
        // Play chiptune processing sound
        if (settings.chiptune) {
          chiptune.playProcessing();
        }
        
        // Send to OpenCode
        sendMessage(cleanedText).then(() => {
          if (settings.chiptune) {
            chiptune.playSuccess();
          }
        }).catch(() => {
          if (settings.chiptune) {
            chiptune.playError();
          }
        });
      }
      clearTranscript();
    }
  }, [transcript, connected, selectedSession, sendMessage, clearTranscript, settings.chiptune]);

  // Clear processed text when transcript is cleared
  useEffect(() => {
    if (!transcript?.text) {
      processedTextRef.current = '';
    }
  }, [transcript]);

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
    } else {
      setSettings(s => ({ ...s, [key]: !s[key] }));
    }
  }, [])

  // Loading status
  const isLoading = isTranscriberLoading || connecting;

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
        ttsEnabled={settings.tts}
        activeWakeWords={activeWakeWords}
      />
      
      {isLoading && (
        <div className="text-xs text-terminal mb-2 animate-pulse">
          [LOADING AI MODELS... {Math.round(transcriptionProgress[0]?.progress || 0)}%]
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
            isProcessing={isTranscribing || isSpeaking} 
          />
          
          <Controls settings={settings} onToggle={handleToggle} />
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

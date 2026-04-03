import { useState, useCallback, useEffect, useRef } from 'react'
import { useOpenCode } from './hooks/useOpenCode'
import { useVoice } from './hooks/useVoice'
import tts from './services/tts'
import './index.css'

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

const StatusBar = ({ status, connected, sessionName, voiceStatus, error, ttsEnabled }) => {
  const icons = {
    idle: '🔇',
    listening: '👂',
    processing: '🧠',
    speaking: '🔊',
    error: '❌'
  }
  
  const colors = {
    idle: 'text-gray-500',
    listening: 'text-terminal animate-pulse',
    processing: 'text-cyan-400',
    speaking: 'text-orange-400',
    error: 'text-red-500'
  }

  const displayStatus = voiceStatus === 'listening' ? 'listening' : 
                       voiceStatus === 'processing' ? 'processing' :
                       status
  
  return (
    <div className="flex items-center justify-between border border-gray-600 p-2 mb-4 bg-black">
      <div className="flex items-center gap-2">
        <span className={`text-lg ${colors[displayStatus] || 'text-gray-500'}`}>
          {icons[displayStatus] || '⚪'}
        </span>
        <span className={`text-sm ${colors[displayStatus] || 'text-gray-500'}`}>
          {displayStatus?.toUpperCase() || 'IDLE'}
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
        {error && (
          <span className="text-xs text-red-500 ml-2">
            [ERROR]
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

const ChatLog = ({ messages, isProcessing }) => (
  <div className="border border-gray-600 p-2 mb-4 bg-black flex-1 overflow-y-auto min-h-0">
    <div className="text-xs text-terminal mb-2 pb-1 border-b border-gray-600 sticky top-0 bg-black">
      ┌─ CHAT LOG ─────────────────────────────┐
    </div>
    <div className="space-y-2">
      {messages.length === 0 ? (
        <div className="text-xs text-gray-500 italic text-center py-8">
          Say &quot;Hey Buddy&quot; or click HOLD TO SPEAK
        </div>
      ) : (
        messages.map((m, i) => (
          <div key={m.id || i} className="text-xs">
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
    </div>
  </div>
)

const PushToTalk = ({ onPress, onRelease, disabled, status }) => (
  <button
    onMouseDown={onPress}
    onMouseUp={onRelease}
    onMouseLeave={onRelease}
    onTouchStart={onPress}
    onTouchEnd={onRelease}
    disabled={disabled}
    className={`w-full py-4 border-2 font-bold text-sm transition-colors disabled:opacity-50
                disabled:cursor-not-allowed ${
                  status === 'listening'
                    ? 'border-orange-400 bg-orange-400/20 text-orange-400'
                    : status === 'processing'
                    ? 'border-cyan-400 bg-cyan-400/20 text-cyan-400'
                    : 'border-terminal bg-black text-terminal active:bg-terminal active:text-black'
                }`}
  >
    {status === 'listening' ? '🔴 LISTENING...' : 
     status === 'processing' ? '⚡ PROCESSING...' :
     '🎤 HOLD TO SPEAK'}
  </button>
)

const Controls = ({ settings, onToggle }) => (
  <div className="flex items-center justify-between text-xs border-t border-gray-600 pt-2 mt-2">
    <div className="flex gap-4">
      <button 
        onClick={() => onToggle('wakeWord')}
        className={`${settings.wakeWord ? 'text-terminal' : 'text-gray-500'}`}
      >
        [Wake: {settings.wakeWord ? 'ON' : 'OFF'}]
      </button>
      <button 
        onClick={() => onToggle('tts')}
        className={`${settings.tts ? 'text-terminal' : 'text-gray-500'}`}
      >
        [TTS: {settings.tts ? 'ON' : 'OFF'}]
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

// Main App
function App() {
  const [settings, setSettings] = useState({
    wakeWord: true,
    tts: true,
    voice: 'M1'
  })
  const [isProcessing, setIsProcessing] = useState(false)
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

  // Voice processing
  const {
    status: voiceStatus,
    transcript,
    classification,
    error: voiceError,
    isLoading: voiceLoading,
    startRecording,
    stopRecording
  } = useVoice()

  // Set TTS voice when settings change
  useEffect(() => {
    tts.setVoice(settings.voice)
  }, [settings.voice])

  // Handle voice transcript and classification
  useEffect(() => {
    if (!transcript || !selectedSession) return
    
    console.log('Voice transcript:', transcript)
    console.log('Classification:', classification)
    
    const processVoice = async () => {
      setIsProcessing(true)
      
      try {
        if (classification?.type === 'command' && classification.action) {
          // Execute native OpenCode command
          console.log('Executing command:', classification.action)
          
          if (settings.tts) {
            tts.speak(`Executing ${classification.action} command`)
          }
          
          await executeCommand(classification.action, classification.params || {})
          
        } else {
          // Send as LLM query
          console.log('Sending to LLM:', transcript)
          
          if (settings.tts) {
            tts.speak('Processing your request')
          }
          
          await sendMessage(transcript)
        }
      } catch (err) {
        console.error('Failed to process voice:', err)
        if (settings.tts) {
          tts.speak('Sorry, there was an error processing your request')
        }
      } finally {
        setIsProcessing(false)
      }
    }
    
    processVoice()
  }, [transcript, classification, selectedSession, executeCommand, sendMessage, settings.tts])

  // Watch for new LLM responses and speak them
  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    
    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.id !== lastMessageRef.current) {
      lastMessageRef.current = lastMessage.id
      
      // Speak the response
      if (settings.tts && lastMessage.content) {
        tts.speak(lastMessage.content)
      }
    }
  }, [messages, settings.tts])

  const handleCreateSession = useCallback(async () => {
    try {
      await createSession(`Voice Session ${sessions.length + 1}`)
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }, [createSession, sessions.length])

  const handlePushToTalk = useCallback(async () => {
    if (!selectedSession) return
    
    // Stop any ongoing TTS
    tts.stop()
    
    try {
      await startRecording({
        onTranscript: (text) => {
          console.log('Transcript received:', text)
        },
        onClassification: (intent) => {
          console.log('Intent classified:', intent)
        },
        onError: (err) => {
          console.error('Voice error:', err)
        }
      })
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  }, [selectedSession, startRecording])

  const handleReleaseTalk = useCallback(async () => {
    try {
      await stopRecording()
    } catch (err) {
      console.error('Failed to stop recording:', err)
    }
  }, [stopRecording])

  const handleToggle = useCallback((key, value) => {
    if (key === 'voice') {
      setSettings(s => ({ ...s, voice: value }))
    } else {
      setSettings(s => ({ ...s, [key]: !s[key] }))
    }
  }, [])

  const displayStatus = voiceStatus === 'listening' ? 'listening' : 
                       voiceStatus === 'processing' ? 'processing' :
                       'idle'

  return (
    <div className="w-full h-screen bg-black p-4 flex flex-col grid-bg">
      <ASCIIHeader />
      
      <StatusBar 
        status={displayStatus}
        connected={connected}
        sessionName={selectedSession?.title || selectedSession?.id}
        voiceStatus={voiceStatus}
        error={apiError || voiceError}
        ttsEnabled={settings.tts}
      />
      
      {voiceLoading && (
        <div className="text-xs text-terminal mb-2 animate-pulse">
          [LOADING AI MODELS...]
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
              <div>Or hold button</div>
              <div className="mt-1 text-gray-600">v1.0.0</div>
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
          <ChatLog messages={messages} isProcessing={isProcessing} />
          
          <PushToTalk 
            onPress={handlePushToTalk}
            onRelease={handleReleaseTalk}
            disabled={!selectedSession || !connected || voiceLoading}
            status={voiceStatus}
          />
          
          <Controls settings={settings} onToggle={handleToggle} />
        </div>
      </div>
    </div>
  )
}

export default App

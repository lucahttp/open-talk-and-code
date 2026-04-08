import { ActivityStatus } from './ActivityStatus'

export const StatusBar = ({ 
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
    if (isListening && activeWakeWords && activeWakeWords.length > 0) return { 
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

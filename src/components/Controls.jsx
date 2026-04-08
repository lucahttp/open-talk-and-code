export const Controls = ({ settings, onToggle, transcriptionMethod, webSpeechSupported }) => (
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

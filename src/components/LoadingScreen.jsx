import { ASCIIHeader } from './ASCIIHeader';

export const LoadingScreen = ({ progress, status, onComplete }) => {
  const totalModels = 5; // Hey Buddy models + Whisper + FunctionGemma
  const completedModels = Object.values(progress).filter(p => p === 100).length;
  const totalProgress = Object.values(progress).reduce((sum, p) => sum + p, 0) / totalModels;
  
  // Check Web Speech API support
  const webSpeechSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  
  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50">
      <ASCIIHeader />
      
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
        
        <div className={`mt-4 text-xs font-mono ${status.includes('Error') ? 'text-red-500 font-bold animate-pulse' : 'text-gray-500'}`}>
          {status}
        </div>
      </div>
      {status.includes('Error') && (
        <button 
          onClick={() => window.location.reload()} 
          className="mt-4 border border-red-500 text-red-500 px-4 py-2 hover:bg-red-500 hover:text-black transition-colors"
        >
          RETRY BOOT
        </button>
      )}
    </div>
  );
};

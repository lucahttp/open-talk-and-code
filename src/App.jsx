import React, { useEffect, useCallback } from 'react';
import gsap from 'gsap';
import './index.css';
import chiptune from './services/chiptune';

import { VoiceAgentProvider, useVoiceAgent } from './contexts/VoiceAgentContext';
import { ASCIIHeader } from './components/ASCIIHeader';
import { StatusBar } from './components/StatusBar';
import { LoadingScreen } from './components/LoadingScreen';
import { WakeWordVisualizer, SpeechVisualizer } from './components/Visualizers';
import { SessionList } from './components/SessionList';
import { ChatLog } from './components/ChatLog';
import { Controls } from './components/Controls';
import { GracePeriodBar } from './components/GracePeriodBar';
import { SpeakingGlowBorder } from './components/SpeakingGlowBorder';
import { QuickListenBar } from './components/QuickListenBar';

// Hey Buddy Configuration
export const ROOT_URL = "https://huggingface.co/benjamin-paine/hey-buddy/resolve/main";
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

function VoiceAgentApp() {
  const {
    settings, handleToggle,
    isModelsLoading, modelsReady, progress, status,
    showPermissionPrompt, setShowPermissionPrompt, handleAllowMicrophone,
    showCreateSessionPopup, handleCreateSessionAndSend, handleCancelCreateSession, pendingMessageRef,
    showTranscriptionError,
    
    openCodeApi, transcriberApi, heyBuddyApi, conversationMachine,
    
    combinedMessages, activeWakeWords
  } = useVoiceAgent();

  const { connected, connecting, sessions, selectedSession, selectSession, createSession, isProcessing, activity, streamingContent, connect } = openCodeApi;
  const { isTranscribing, isModelLoading: isTranscriberLoading, progress: transcriptionProgress, transcriptionMethod, webSpeechSupported } = transcriberApi;
  const { isInitialized, isRecording, isListening, speechProbability, wakeWords: wakeWordsState } = heyBuddyApi;
  const { state: conversationState, STATES, graceSeconds, quickListenSeconds } = conversationMachine;

  // Handle wake word GSAP animation
  useEffect(() => {
    if (activeWakeWords.length > 0 && settings.chiptune) {
      gsap.fromTo('.main-container',
        { boxShadow: '0 0 0 4px #00ff00, inset 0 0 100px rgba(0, 255, 0, 0.2)' },
        { boxShadow: '0 0 0 0px transparent, inset 0 0 0px transparent', duration: 0.6, ease: 'power2.out' }
      );
    }
  }, [activeWakeWords, settings.chiptune]);

  // AudioContext must be initialized by user gesture
  useEffect(() => {
    const initAudio = () => {
      if (!chiptune.isInitialized || !chiptune.ctx || chiptune.ctx.state === 'suspended') {
        chiptune.init();
      }
      if (chiptune.isInitialized) {
        window.removeEventListener('click', initAudio);
        window.removeEventListener('keydown', initAudio);
      }
    };
    window.addEventListener('click', initAudio);
    window.addEventListener('keydown', initAudio);
    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
    };
  }, []);

  const handleCreateSession = useCallback(async () => {
    try {
      await createSession(`Voice Session ${sessions.length + 1}`)
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }, [createSession, sessions.length])

  // Loading status
  const isLoading = isTranscriberLoading || connecting;

  if (isModelsLoading || !modelsReady) {
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
        isSpeaking={conversationState === STATES.SPEAKING}
        isTranscribing={isTranscribing}
        isGenerating={false}
        isProcessing={isProcessing}
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
      
      {showTranscriptionError && (
        <div className="fixed top-4 right-4 z-50 border border-red-500 bg-black p-3 max-w-sm">
          <div className="text-red-500 text-sm font-bold mb-1">⚠️ Transcription Error</div>
          <div className="text-gray-400 text-xs">{showTranscriptionError}</div>
          {webSpeechSupported && transcriptionMethod !== 'webspeech' && (
            <div className="text-yellow-400 text-xs mt-2">Switching to Web Speech API fallback...</div>
          )}
          {!webSpeechSupported && (
            <div className="text-red-400 text-xs mt-2">Web Speech API not available in this browser.</div>
          )}
        </div>
      )}

      {isInitialized && (
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-1">Wake Word Detection</div>
            <WakeWordVisualizer wakeWords={wakeWordsState} />
          </div>
          <div className="w-64">
            <div className="text-xs text-gray-500 mb-1">Speech Activity</div>
            <SpeechVisualizer probability={speechProbability} />
          </div>
        </div>
      )}
      
      <div className="flex gap-4 flex-1 min-h-0">
        <div className="w-64 flex flex-col">
          <SessionList 
            sessions={sessions}
            selectedId={selectedSession?.id}
            onSelect={selectSession}
            onCreate={handleCreateSession}
            loading={connecting}
          />
          
          <div className="text-xs text-gray-500 mt-auto space-y-2">
            <div className="border border-gray-600 p-2">
              <div className="text-terminal mb-1">┌─ HELP ─┐</div>
              <div>Say &quot;Hey Buddy&quot;</div>
              <div>Or any wake word</div>
              <div className="text-gray-600 mt-1">v2.0.0 (Mortimer)</div>
              {!connected && (
                <button onClick={connect} className="mt-2 text-terminal border border-terminal px-2 py-1 hover:bg-terminal hover:text-black">
                  [RECONNECT]
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col min-h-0">
          <ChatLog 
            messages={combinedMessages} 
            isProcessing={isProcessing}
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
      
      <GracePeriodBar seconds={graceSeconds} isActive={conversationState === STATES.GRACE_PERIOD} />
      <SpeakingGlowBorder isActive={conversationState === STATES.SPEAKING || conversationState === STATES.QUICK_LISTEN} />
      <QuickListenBar secondsRemaining={quickListenSeconds} isActive={conversationState === STATES.QUICK_LISTEN} />

      {showPermissionPrompt && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="border-2 border-terminal p-6 max-w-md bg-black">
            <h2 className="text-terminal text-lg font-bold mb-4">Microphone Permission Required</h2>
            <p className="text-gray-400 text-sm mb-4">
              This voice agent needs microphone access to detect wake words (&quot;Hey Buddy&quot;) 
              and record your voice commands.
            </p>
            <div className="flex gap-4">
              <button onClick={handleAllowMicrophone} className="flex-1 border border-terminal text-terminal py-2 hover:bg-terminal hover:text-black">ALLOW MICROPHONE</button>
              <button onClick={() => setShowPermissionPrompt(false)} className="flex-1 border border-gray-600 text-gray-400 py-2 hover:border-red-500 hover:text-red-500">CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {showCreateSessionPopup && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="border-2 border-terminal p-6 max-w-md bg-black">
            <h2 className="text-terminal text-lg font-bold mb-4">No Session Selected</h2>
            <p className="text-gray-400 text-sm mb-4">You need to create a session to send messages to OpenCode.</p>
            {pendingMessageRef.current && (
              <div className="mb-4 p-2 border border-terminal/30 bg-terminal/5">
                <p className="text-terminal text-xs mb-1">Pending message:</p>
                <p className="text-gray-300 text-sm italic">&quot;{pendingMessageRef.current.substring(0, 60)}{pendingMessageRef.current.length > 60 ? '...' : ''}&quot;</p>
              </div>
            )}
            <div className="flex gap-4">
              <button onClick={handleCreateSessionAndSend} className="flex-1 border border-terminal text-terminal py-2 hover:bg-terminal hover:text-black">CREATE SESSION & SEND</button>
              <button onClick={handleCancelCreateSession} className="flex-1 border border-gray-600 text-gray-400 py-2 hover:border-red-500 hover:text-red-500">CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <VoiceAgentProvider heyBuddyOptions={heyBuddyOptions}>
      <VoiceAgentApp />
    </VoiceAgentProvider>
  );
}

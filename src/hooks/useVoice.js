import { useState, useCallback, useEffect, useRef } from 'react'
import audioRecorder from '../services/audio'
import whisperSTT from '../services/whisper'
import intentClassifier from '../services/intent'

export function useVoice() {
  const [status, setStatus] = useState('idle') // idle, listening, processing, error
  const [transcript, setTranscript] = useState('')
  const [classification, setClassification] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const recordingRef = useRef(false)

  // Preload models on mount
  useEffect(() => {
    const preload = async () => {
      try {
        setIsLoading(true)
        // Load both models in parallel
        await Promise.all([
          whisperSTT.load().catch(err => console.warn('Whisper preload failed:', err)),
          intentClassifier.load().catch(err => console.warn('FunctionGemma preload failed:', err))
        ])
        setIsLoading(false)
      } catch (err) {
        console.error('Failed to preload models:', err)
        setIsLoading(false)
      }
    }
    
    preload()
  }, [])

  const startRecording = useCallback(async (options = {}) => {
    const { onTranscript, onClassification, onError } = options
    
    try {
      setStatus('listening')
      setTranscript('')
      setClassification(null)
      setError(null)
      recordingRef.current = true

      // Request microphone permission
      const hasPermission = await audioRecorder.requestPermission()
      if (!hasPermission) {
        throw new Error('Microphone permission denied')
      }

      await audioRecorder.start({
        onData: (chunk) => {
          // Audio chunk received
          console.log('Audio chunk:', chunk.size)
        },
        onSilence: async () => {
          // Silence detected, stop and process
          if (!recordingRef.current) return
          
          recordingRef.current = false
          setStatus('processing')
          
          try {
            const audioBlob = audioRecorder.stop()
            
            if (!audioBlob || audioBlob.size === 0) {
              setStatus('idle')
              return
            }

            // Convert to audio buffer
            const audioBuffer = await audioRecorder.blobToAudioBuffer(audioBlob)
            
            // Transcribe
            console.log('Transcribing...')
            const result = await whisperSTT.transcribe(audioBuffer)
            
            setTranscript(result.text)
            
            if (result.text && onTranscript) {
              onTranscript(result.text)
            }

            // Classify intent
            if (result.text) {
              console.log('Classifying intent...')
              const intent = await intentClassifier.classify(result.text)
              setClassification(intent)
              
              if (onClassification) {
                onClassification(intent)
              }
            }
            
            setStatus('idle')
          } catch (err) {
            console.error('Processing error:', err)
            setError(err.message)
            setStatus('error')
            if (onError) onError(err)
          }
        },
        silenceDuration: 2000 // Stop after 2s of silence
      })

    } catch (err) {
      console.error('Recording error:', err)
      setError(err.message)
      setStatus('error')
      recordingRef.current = false
      if (onError) onError(err)
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return null
    
    recordingRef.current = false
    
    try {
      const audioBlob = audioRecorder.stop()
      
      if (!audioBlob || audioBlob.size === 0) {
        setStatus('idle')
        return null
      }

      setStatus('processing')
      
      // Convert to audio buffer
      const audioBuffer = await audioRecorder.blobToAudioBuffer(audioBlob)
      
      // Transcribe
      const result = await whisperSTT.transcribe(audioBuffer)
      
      setTranscript(result.text)
      
      // Classify intent
      let intent = null
      if (result.text) {
        intent = await intentClassifier.classify(result.text)
        setClassification(intent)
      }
      
      setStatus('idle')
      
      return {
        text: result.text,
        intent
      }
    } catch (err) {
      console.error('Processing error:', err)
      setError(err.message)
      setStatus('error')
      throw err
    }
  }, [])

  const cancelRecording = useCallback(() => {
    recordingRef.current = false
    audioRecorder.stop()
    setStatus('idle')
    setTranscript('')
    setClassification(null)
  }, [])

  return {
    status,
    transcript,
    classification,
    error,
    isLoading,
    startRecording,
    stopRecording,
    cancelRecording,
    isRecording: status === 'listening'
  }
}

/**
 * Whisper Speech-to-Text Service
 * Uses transformers.js for browser-based STT with WebGPU acceleration
 */

import { pipeline } from '@huggingface/transformers'

class WhisperSTT {
  constructor() {
    this.transcriber = null
    this.model = 'onnx-community/whisper-tiny' // or 'onnx-community/whisper-base' for better accuracy
    this.isLoading = false
    this.loadingPromise = null
  }

  async load() {
    if (this.transcriber) return this.transcriber
    if (this.isLoading) return this.loadingPromise

    this.isLoading = true
    console.log('Loading Whisper model...')

    this.loadingPromise = pipeline(
      'automatic-speech-recognition',
      this.model,
      {
        dtype: 'fp16', // Use FP16 for better performance
        device: 'webgpu' // Use WebGPU if available
      }
    ).then(transcriber => {
      this.transcriber = transcriber
      this.isLoading = false
      console.log('✅ Whisper loaded')
      return transcriber
    }).catch(err => {
      this.isLoading = false
      console.error('❌ Failed to load Whisper:', err)
      throw err
    })

    return this.loadingPromise
  }

  async transcribe(audioData, options = {}) {
    if (!this.transcriber) {
      await this.load()
    }

    const { language = 'es', task = 'transcribe' } = options

    try {
      console.log('Transcribing audio...')
      
      const result = await this.transcriber(audioData, {
        language,
        task,
        return_timestamps: false
      })

      console.log('Transcription:', result.text)
      
      return {
        text: result.text?.trim() || '',
        confidence: 0.9, // Whisper doesn't provide confidence scores directly
        language: language
      }
    } catch (err) {
      console.error('Transcription failed:', err)
      throw err
    }
  }

  // Check if model is loaded
  isReady() {
    return !!this.transcriber
  }
}

// Singleton instance
const whisperSTT = new WhisperSTT()

export default whisperSTT
export { WhisperSTT }

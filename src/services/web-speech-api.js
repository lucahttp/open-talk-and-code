/**
 * Web Speech API Transcription Service
 * Fallback for when Whisper fails to load
 * Uses browser's built-in SpeechRecognition API
 */

class WebSpeechTranscription {
  constructor() {
    this.recognition = null
    this.isSupported = this.checkSupport()
    this.isListening = false
  }

  checkSupport() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  }

  getRecognition() {
    if (!this.isSupported) return null
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    
    return recognition
  }

  async transcribe(audioBlob, language = 'en-US') {
    if (!this.isSupported) {
      throw new Error('Web Speech API not supported in this browser')
    }

    return new Promise((resolve, reject) => {
      const recognition = this.getRecognition()
      
      if (!recognition) {
        reject(new Error('Failed to create SpeechRecognition instance'))
        return
      }

      recognition.lang = language
      
      let finalTranscript = ''
      let interimTranscript = ''

      recognition.onresult = (event) => {
        interimTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }
      }

      recognition.onerror = (event) => {
        this.isListening = false
        
        // Handle specific error cases
        switch (event.error) {
          case 'no-speech':
            // No speech detected - this is okay, just return empty
            resolve({
              text: finalTranscript || '',
              confidence: 0,
              isFinal: true
            })
            break
          case 'audio-capture':
            reject(new Error('No microphone was found or microphone is not working'))
            break
          case 'not-allowed':
            reject(new Error('Microphone permission was denied'))
            break
          case 'network':
            reject(new Error('Network error occurred during speech recognition'))
            break
          default:
            reject(new Error(`Speech recognition error: ${event.error}`))
        }
      }

      recognition.onend = () => {
        this.isListening = false
        resolve({
          text: finalTranscript || interimTranscript || '',
          confidence: finalTranscript ? 0.9 : 0.5,
          isFinal: true
        })
      }

      this.isListening = true
      
      try {
        recognition.start()
      } catch (err) {
        reject(new Error(`Failed to start recognition: ${err.message}`))
      }
    })
  }

  stop() {
    if (this.recognition && this.isListening) {
      this.recognition.stop()
      this.isListening = false
    }
  }

  abort() {
    if (this.recognition && this.isListening) {
      this.recognition.abort()
      this.isListening = false
    }
  }
}

// Singleton instance
const webSpeechTranscription = new WebSpeechTranscription()

export default webSpeechTranscription
export { WebSpeechTranscription }

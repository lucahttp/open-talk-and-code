/**
 * Text-to-Speech Service
 * Uses Supertonic 2 if available, otherwise Web Speech API as fallback
 */

class TTSService {
  constructor() {
    this.voice = 'M1'
    this.synth = window.speechSynthesis
    this.supertonic = null
    this.isLoading = false
    this.preferredVoices = {
      'M1': { lang: 'es-ES', pitch: 0.8, rate: 1 },
      'M2': { lang: 'es-ES', pitch: 0.9, rate: 1 },
      'M3': { lang: 'en-US', pitch: 0.8, rate: 1 },
      'M4': { lang: 'en-US', pitch: 0.9, rate: 1 },
      'M5': { lang: 'en-GB', pitch: 0.8, rate: 1 },
      'F1': { lang: 'es-ES', pitch: 1.2, rate: 1 },
      'F2': { lang: 'es-ES', pitch: 1.3, rate: 1 },
      'F3': { lang: 'en-US', pitch: 1.2, rate: 1 },
      'F4': { lang: 'en-US', pitch: 1.3, rate: 1 },
      'F5': { lang: 'en-GB', pitch: 1.2, rate: 1 }
    }
  }

  setVoice(voiceId) {
    if (this.preferredVoices[voiceId]) {
      this.voice = voiceId
    }
  }

  // Check if TTS is available
  isAvailable() {
    return 'speechSynthesis' in window
  }

  // Content filtering - skip code, diffs, etc.
  shouldSpeak(text) {
    // Skip if empty or too short
    if (!text || text.length < 3) return false
    
    // Skip code blocks
    if (text.includes('```') || text.includes('  ')) return false
    
    // Skip file diffs
    if (text.includes('diff') && text.includes('@@')) return false
    
    // Skip JSON
    if (text.startsWith('{') || text.startsWith('[')) return false
    
    // Skip if mostly special characters
    const alphaRatio = text.replace(/[^a-zA-Z]/g, '').length / text.length
    if (alphaRatio < 0.3) return false
    
    return true
  }

  // Extract speakable content from LLM response
  extractSpeakable(text) {
    // Remove code blocks
    let cleaned = text.replace(/```[\s\S]*?```/g, '[code]')
    
    // Remove inline code
    cleaned = cleaned.replace(/`[^`]+`/g, '[code]')
    
    // Remove URLs
    cleaned = cleaned.replace(/https?:\/\/\S+/g, '[link]')
    
    // Remove file paths
    cleaned = cleaned.replace(/[\/\\][\w-_.\/\\]+/g, '[file]')
    
    // Remove excessive whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
    
    return cleaned
  }

  async speak(text) {
    if (!this.isAvailable()) {
      console.warn('TTS not available')
      return
    }

    if (!this.shouldSpeak(text)) {
      console.log('Skipping TTS for:', text.substring(0, 50))
      return
    }

    const speakable = this.extractSpeakable(text)
    if (!speakable || speakable.length < 3) {
      console.log('No speakable content')
      return
    }

    // Cancel any ongoing speech
    this.synth.cancel()

    const utterance = new SpeechSynthesisUtterance(speakable)
    
    // Apply voice settings
    const settings = this.preferredVoices[this.voice] || this.preferredVoices['M1']
    utterance.lang = settings.lang
    utterance.pitch = settings.pitch
    utterance.rate = settings.rate
    
    // Try to find matching voice
    const voices = this.synth.getVoices()
    const matchingVoice = voices.find(v => 
      v.lang.startsWith(settings.lang) && 
      (this.voice.startsWith('F') ? v.name.includes('Female') || v.name.includes('Elena') || v.name.includes('Monica') : 
       this.voice.startsWith('M') ? v.name.includes('Male') || v.name.includes('Jorge') || v.name.includes('Diego') : true)
    )
    
    if (matchingVoice) {
      utterance.voice = matchingVoice
    }

    utterance.onstart = () => {
      console.log('🔊 TTS started')
    }

    utterance.onend = () => {
      console.log('🔊 TTS ended')
    }

    utterance.onerror = (err) => {
      console.error('TTS error:', err)
    }

    this.synth.speak(utterance)
  }

  stop() {
    if (this.isAvailable()) {
      this.synth.cancel()
    }
  }

  pause() {
    if (this.isAvailable()) {
      this.synth.pause()
    }
  }

  resume() {
    if (this.isAvailable()) {
      this.synth.resume()
    }
  }
}

// Singleton
const tts = new TTSService()

export default tts
export { TTSService }

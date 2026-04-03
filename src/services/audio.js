/**
 * Audio Recording Service
 * Captures microphone input for voice processing
 */

class AudioRecorder {
  constructor() {
    this.stream = null
    this.mediaRecorder = null
    this.audioContext = null
    this.analyser = null
    this.isRecording = false
    this.audioChunks = []
    this.silenceTimeout = null
    this.onSilenceCallback = null
    this.onDataCallback = null
    this.silenceThreshold = -50 // dB
    this.silenceDuration = 2000 // ms
  }

  async requestPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        } 
      })
      this.stream = stream
      return true
    } catch (err) {
      console.error('Microphone permission denied:', err)
      return false
    }
  }

  async start(options = {}) {
    const { 
      onData, 
      onSilence, 
      silenceThreshold = -50,
      silenceDuration = 2000 
    } = options

    if (!this.stream) {
      const permitted = await this.requestPermission()
      if (!permitted) {
        throw new Error('Microphone permission required')
      }
    }

    this.onDataCallback = onData
    this.onSilenceCallback = onSilence
    this.silenceThreshold = silenceThreshold
    this.silenceDuration = silenceDuration
    this.audioChunks = []

    // Setup audio context for analysis
    this.audioContext = new AudioContext({ sampleRate: 16000 })
    const source = this.audioContext.createMediaStreamSource(this.stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 256
    source.connect(this.analyser)

    // Setup media recorder
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: 'audio/webm;codecs=opus'
    })

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data)
        if (this.onDataCallback) {
          this.onDataCallback(event.data)
        }
      }
    }

    this.mediaRecorder.onstop = () => {
      this._clearSilenceTimer()
    }

    // Start recording
    this.mediaRecorder.start(100) // Collect 100ms chunks
    this.isRecording = true

    // Start silence detection
    this._detectSilence()

    console.log('🎤 Recording started')
  }

  stop() {
    if (!this.isRecording) return null

    this.isRecording = false
    this._clearSilenceTimer()

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }

    if (this.audioContext) {
      this.audioContext.close()
    }

    // Combine chunks into single blob
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })
    
    console.log('🎤 Recording stopped')
    
    return audioBlob
  }

  _detectSilence() {
    if (!this.isRecording || !this.analyser) return

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(dataArray)
    
    // Calculate average volume
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length
    const db = 20 * Math.log10(average / 255)

    if (db < this.silenceThreshold) {
      // Silence detected
      if (!this.silenceTimeout) {
        this.silenceTimeout = setTimeout(() => {
          console.log('Silence detected, stopping recording...')
          if (this.onSilenceCallback) {
            this.onSilenceCallback()
          }
        }, this.silenceDuration)
      }
    } else {
      // Sound detected, clear silence timer
      this._clearSilenceTimer()
    }

    // Continue detecting
    if (this.isRecording) {
      requestAnimationFrame(() => this._detectSilence())
    }
  }

  _clearSilenceTimer() {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout)
      this.silenceTimeout = null
    }
  }

  // Convert Blob to ArrayBuffer for processing
  async blobToArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsArrayBuffer(blob)
    })
  }

  // Convert Blob to AudioBuffer
  async blobToAudioBuffer(blob) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 16000 })
    }
    
    const arrayBuffer = await this.blobToArrayBuffer(blob)
    return this.audioContext.decodeAudioData(arrayBuffer)
  }

  isActive() {
    return this.isRecording
  }
}

// Singleton
const audioRecorder = new AudioRecorder()

export default audioRecorder
export { AudioRecorder }

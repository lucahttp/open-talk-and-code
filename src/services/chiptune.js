/**
 * TARS-style Chiptune Audio Service
 * Generates robotic, minimal, futuristic sounds inspired by Interstellar's TARS
 * Uses Web Audio API with square/sawtooth waves
 */

class ChiptuneService {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            console.warn('Web Audio API not supported');
            return;
        }
        
        this.audioContext = new AudioContextClass();
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.15; // Low volume - subtle
        this.masterGain.connect(this.audioContext.destination);
        
        this.initialized = true;
    }

    /**
     * TARS Wake Word Detection Sound
     * Sequence: Low robotic blip → mechanical whir → confirmation beep
     * Style: Industrial, precise, futuristic
     */
    playWakeWordDetected() {
        this.init();
        if (!this.initialized) return;

        const now = this.audioContext.currentTime;
        
        // TARS Sound 1: Mechanical initialization (50ms)
        this.playTone({
            frequency: 150,
            type: 'sawtooth',
            duration: 0.05,
            startTime: now,
            attack: 0.005,
            decay: 0.04,
            gain: 0.3
        });

        // TARS Sound 2: Processing whir (80ms, sliding pitch)
        this.playSlideTone({
            startFreq: 300,
            endFreq: 600,
            type: 'square',
            duration: 0.08,
            startTime: now + 0.06,
            gain: 0.2
        });

        // TARS Sound 3: Confirmation chirp (high, short, precise)
        this.playTone({
            frequency: 1200,
            type: 'square',
            duration: 0.04,
            startTime: now + 0.15,
            attack: 0.001,
            decay: 0.03,
            gain: 0.25
        });

        // TARS Sound 4: Subtle reverb tail (low frequency fade)
        this.playTone({
            frequency: 200,
            type: 'sine',
            duration: 0.2,
            startTime: now + 0.18,
            attack: 0.05,
            decay: 0.15,
            gain: 0.1
        });
    }

    /**
     * Play a single tone with envelope
     */
    playTone({ frequency, type, duration, startTime, attack = 0.01, decay = 0.1, gain = 0.3 }) {
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, startTime);
        
        // Envelope: Attack → Sustain → Decay
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(gain, startTime + attack);
        gainNode.gain.setValueAtTime(gain, startTime + duration - decay);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(this.masterGain);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
        
        // Cleanup
        setTimeout(() => {
            osc.disconnect();
            gainNode.disconnect();
        }, (startTime + duration + 0.1) * 1000);
    }

    /**
     * Play a sliding tone (pitch bend)
     */
    playSlideTone({ startFreq, endFreq, type, duration, startTime, gain = 0.3 }) {
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, startTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
        
        // Quick attack/decay envelope
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.01);
        gainNode.gain.setValueAtTime(gain, startTime + duration - 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(this.masterGain);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
        
        setTimeout(() => {
            osc.disconnect();
            gainNode.disconnect();
        }, (startTime + duration + 0.1) * 1000);
    }

    /**
     * Recording Start Sound - Subtle "listening" indicator
     */
    playRecordingStart() {
        this.init();
        if (!this.initialized) return;

        const now = this.audioContext.currentTime;
        
        // Two quick blips - like a scanner activating
        this.playTone({
            frequency: 800,
            type: 'square',
            duration: 0.03,
            startTime: now,
            gain: 0.2
        });
        
        this.playTone({
            frequency: 1000,
            type: 'square',
            duration: 0.03,
            startTime: now + 0.04,
            gain: 0.2
        });
    }

    /**
     * Processing Sound - Thinking/processing indicator
     */
    playProcessing() {
        this.init();
        if (!this.initialized) return;

        const now = this.audioContext.currentTime;
        
        // Rapid ascending tones - like processing
        for (let i = 0; i < 3; i++) {
            this.playTone({
                frequency: 400 + (i * 200),
                type: 'sawtooth',
                duration: 0.05,
                startTime: now + (i * 0.06),
                gain: 0.15
            });
        }
    }

    /**
     * Success/Complete Sound
     */
    playSuccess() {
        this.init();
        if (!this.initialized) return;

        const now = this.audioContext.currentTime;
        
        // Three descending notes - confirmation
        [1200, 1000, 800].forEach((freq, i) => {
            this.playTone({
                frequency: freq,
                type: 'square',
                duration: 0.08,
                startTime: now + (i * 0.1),
                gain: 0.2
            });
        });
    }

    /**
     * Error Sound
     */
    playError() {
        this.init();
        if (!this.initialized) return;

        const now = this.audioContext.currentTime;
        
        // Low error buzz
        this.playTone({
            frequency: 150,
            type: 'sawtooth',
            duration: 0.2,
            startTime: now,
            gain: 0.3
        });
    }
}

// Singleton instance
const chiptune = new ChiptuneService();

export default chiptune;
export { ChiptuneService };

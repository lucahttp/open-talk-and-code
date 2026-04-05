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
        this.initAttempts = 0;
    }

    async init() {
        if (this.initialized) return true;
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            console.warn('Web Audio API not supported');
            return false;
        }
        
        try {
            this.audioContext = new AudioContextClass();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.15; // Low volume - subtle
            this.masterGain.connect(this.audioContext.destination);
            
            // Try to resume audio context (needed for browsers that block audio)
            if (this.audioContext.state === 'suspended') {
                try {
                    await this.audioContext.resume();
                } catch (e) {
                    // If resume fails, audio will be initialized on first user gesture
                    console.log('[Chiptune] AudioContext needs user gesture to start');
                }
            }
            
            // Only mark as initialized if context is running
            if (this.audioContext.state === 'running') {
                this.initialized = true;
                this.initAttempts = 0;
                return true;
            }
            
            // Context is created but suspended - will be resumed on first play
            return false;
        } catch (err) {
            console.warn('Failed to initialize audio:', err);
            this.initAttempts++;
            return false;
        }
    }

    /**
     * Safely play a sound - handles initialization and errors
     */
    async safePlay(playFn) {
        // Try to initialize if not already done
        if (!this.initialized) {
            const success = await this.init();
            
            // If context exists but is suspended, try to resume it (requires user gesture)
            if (!success && this.audioContext && this.audioContext.state === 'suspended') {
                try {
                    await this.audioContext.resume();
                    this.initialized = true;
                } catch (e) {
                    console.warn('[Chiptune] Cannot play - user interaction needed first');
                    return;
                }
            }
            
            if (!this.initialized && this.initAttempts > 3) {
                // Give up after 3 attempts
                return;
            }
        }
        
        // Ensure audio context is running
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
            } catch (err) {
                console.warn('Could not resume audio context:', err);
                return;
            }
        }
        
        try {
            playFn();
        } catch (err) {
            console.warn('Audio play failed:', err);
        }
    }

    /**
     * Grace Period Reset Sound - "Revive" style from video games
     * Ascending arpeggio que suena como recuperar vida/resetear estado
     * Style: 8-bit RPG "item get" o "continue" sound
     */
    playGracePeriodReset() {
        this.safePlay(() => {
            const now = this.audioContext.currentTime;
            
            // Arpeggio ascendente rápido tipo "1-up" o "continue"
            const notes = [440, 554, 659, 880]; // A, C#, E, A (acorde mayor)
            
            notes.forEach((freq, i) => {
                this.playTone({
                    frequency: freq,
                    type: 'square',
                    duration: 0.08,
                    startTime: now + (i * 0.04),
                    attack: 0.005,
                    decay: 0.06,
                    gain: 0.25
                });
            });
            
            // Final "sparkle" note
            this.playTone({
                frequency: 1760, // High A octave above
                type: 'sine',
                duration: 0.15,
                startTime: now + 0.18,
                attack: 0.01,
                decay: 0.12,
                gain: 0.2
            });
        });
    }

    /**
     * Wake Word Start Recording - Feedback de que empezó a grabar
     * Distinto del playWakeWordDetected (ese es del modelo detectando)
     * Este es para indicar al usuario "estoy escuchándote ahora"
     */
    playStartRecording() {
        this.safePlay(() => {
            const now = this.audioContext.currentTime;
            
            // Sonido de "comienzo" tipo scanner/sonar
            // Slide descendente corto
            this.playSlideTone({
                startFreq: 600,
                endFreq: 300,
                type: 'sine',
                duration: 0.15,
                startTime: now,
                gain: 0.25
            });
            
            // Eco sutil
            this.playSlideTone({
                startFreq: 600,
                endFreq: 300,
                type: 'sine',
                duration: 0.12,
                startTime: now + 0.08,
                gain: 0.15
            });
        });
    }

    /**
     * TARS Wake Word Detection Sound
     * Sequence: Low robotic blip → mechanical whir → confirmation beep
     * Style: Industrial, precise, futuristic
     */
    playWakeWordDetected() {
        this.safePlay(() => {
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
        });
    }

    /**
     * Play a single tone with envelope
     */
    playTone({ frequency, type, duration, startTime, attack = 0.01, decay = 0.1, gain = 0.3 }) {
        if (!this.audioContext) return;

        try {
            // Ensure startTime is not negative
            const now = this.audioContext.currentTime;
            const actualStartTime = Math.max(now, startTime);

            // Ensure duration is at least attack + decay to avoid negative times
            const actualDuration = Math.max(duration, attack + decay + 0.01);

            const osc = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(frequency, actualStartTime);

            // Envelope: Attack → Sustain → Decay
            gainNode.gain.setValueAtTime(0, actualStartTime);
            gainNode.gain.linearRampToValueAtTime(gain, actualStartTime + attack);

            // Calculate decay start time (ensure it's not before attack ends)
            const decayStart = Math.max(actualStartTime + attack, actualStartTime + actualDuration - decay);
            gainNode.gain.setValueAtTime(gain, decayStart);
            gainNode.gain.exponentialRampToValueAtTime(0.001, actualStartTime + actualDuration);

            osc.connect(gainNode);
            gainNode.connect(this.masterGain);

            osc.start(actualStartTime);
            osc.stop(actualStartTime + actualDuration);

            // Cleanup
            const cleanupTime = Math.max(0, (actualStartTime + actualDuration + 0.1 - now) * 1000);
            if (cleanupTime < 10000) { // Only schedule if reasonable time
                setTimeout(() => {
                    try {
                        osc.disconnect();
                        gainNode.disconnect();
                    } catch (e) {}
                }, cleanupTime);
            }
        } catch (err) {
            console.warn('playTone error:', err);
        }
    }

    /**
     * Play a sliding tone (pitch bend)
     */
    playSlideTone({ startFreq, endFreq, type, duration, startTime, gain = 0.3 }) {
        if (!this.audioContext) return;
        
        try {
            // Ensure startTime is not negative
            const now = this.audioContext.currentTime;
            const actualStartTime = Math.max(now, startTime);
            
            const osc = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            osc.type = type;
            osc.frequency.setValueAtTime(startFreq, actualStartTime);
            osc.frequency.exponentialRampToValueAtTime(endFreq, actualStartTime + duration);
            
            // Quick attack/decay envelope
            gainNode.gain.setValueAtTime(0, actualStartTime);
            gainNode.gain.linearRampToValueAtTime(gain, actualStartTime + 0.01);
            gainNode.gain.setValueAtTime(gain, actualStartTime + duration - 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, actualStartTime + duration);
            
            osc.connect(gainNode);
            gainNode.connect(this.masterGain);
            
            osc.start(actualStartTime);
            osc.stop(actualStartTime + duration);
            
            // Cleanup
            const cleanupTime = Math.max(0, (actualStartTime + duration + 0.1 - now) * 1000);
            if (cleanupTime < 10000) {
                setTimeout(() => {
                    try {
                        osc.disconnect();
                        gainNode.disconnect();
                    } catch (e) {}
                }, cleanupTime);
            }
        } catch (err) {
            console.warn('playSlideTone error:', err);
        }
    }

    /**
     * Recording Start Sound - Subtle "listening" indicator
     */
    playRecordingStart() {
        this.safePlay(() => {
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
        });
    }

    /**
     * Processing Sound - Thinking/processing indicator
     */
    playProcessing() {
        this.safePlay(() => {
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
        });
    }

    /**
     * Success/Complete Sound
     */
    playSuccess() {
        this.safePlay(() => {
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
        });
    }

    /**
     * Error Sound
     */
    playError() {
        this.safePlay(() => {
            const now = this.audioContext.currentTime;
            
            // Low error buzz
            this.playTone({
                frequency: 150,
                type: 'sawtooth',
                duration: 0.2,
                startTime: now,
                gain: 0.3
            });
        });
    }
}

// Singleton instance
const chiptune = new ChiptuneService();

export default chiptune;
export { ChiptuneService };

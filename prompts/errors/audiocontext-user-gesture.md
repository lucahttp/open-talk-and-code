# Error: AudioContext Not Allowed to Start
**Date:** 2026-04-05  
**Source:** Chrome DevTools Console Warning

## Error Message
```
The AudioContext was not allowed to start. 
It must be resumed (or created) after a user gesture on the page.
```

## Root Cause
Browser security policy requires user interaction (click, keypress) before AudioContext can start. This affects:
- Chiptune sounds (TARS-style beeps)
- Grace period processor audio analysis
- TTS output (Web Speech API)

## Affected Code
```javascript
// In chiptune.js
const audioContext = new AudioContext();  // ❌ Suspended state

// In useGracePeriodRecorder.js  
const audioContext = new AudioContext();  // ❌ Suspended state
```

## Solution Applied

### 1. Chiptune Service - Safe Initialization
```javascript
async init() {
  const audioContext = new AudioContext();
  
  // Try to resume, but don't fail if not allowed yet
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (e) {
      console.log('[Chiptune] Needs user gesture to start');
    }
  }
  
  // Only mark as initialized if running
  if (audioContext.state === 'running') {
    this.initialized = true;
  }
}

// Play function tries to resume on first user interaction
async safePlay(playFn) {
  if (!this.initialized) {
    await this.init();
    
    // If still not running, try to resume (may be first interaction)
    if (this.audioContext?.state === 'suspended') {
      try {
        await this.audioContext.resume();
        this.initialized = true;
      } catch (e) {
        return; // Can't play yet
      }
    }
  }
  
  playFn();
}
```

### 2. Grace Period Recorder - Safe VAD
```javascript
const initAudioContext = async (stream) => {
  const audioContext = new AudioContext();
  
  // Try to resume - may fail if no user gesture
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (e) {
      console.log('[GracePeriodRecorder] AudioContext needs user gesture');
    }
  }
  
  // Continue even if suspended - will resume on first interaction
  return { audioContext, analyser };
};
```

## User Interaction Triggers
AudioContext automatically resumes on:
- Clicking "ALLOW MICROPHONE" button
- Clicking any control button ([TTS], [SFX], etc.)
- Selecting a session from list
- Any user-initiated action

## Testing
- [ ] First load: AudioContext starts suspended
- [ ] After clicking "ALLOW": AudioContext resumes
- [ ] Chiptune plays after permission granted
- [ ] Grace period VAD works after interaction
- [ ] No console errors after user gesture

## Prevention
- Never auto-play audio on page load
- Always have user-initiated start
- Check AudioContext state before operations
- Handle suspended state gracefully

## Browser Compatibility
- **Chrome/Edge:** Strict policy, requires interaction
- **Firefox:** Similar policy, slightly more lenient
- **Safari:** Most strict, may require explicit user action
- **Mobile:** Always requires interaction (touch)

## Related Errors
```
[Web Audio API] Failed to resume audio context
[GracePeriodRecorder] AudioContext needs user gesture
```
All fixed by the same pattern: safe initialization + resume on interaction.

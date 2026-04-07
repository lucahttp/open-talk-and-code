# Prompt: Conversational Voice Agent with Grace Period
**Date:** 2026-04-05  
**Source:** User Request + Implementation Session

## Initial Request (User)
"Quiero que arregles el flujo conversacional: WAKE WORD -> STT -> OPENCODE (LLM) -> LOOP over Streamed responses -> TTS -> WHISPER waiting for quick response for 15s. While speaking the transcription is listening and connected to FunctionGemma if the user says stop it stops and ask what."

## Functional Requirements Defined

### 1. Wake Word Detection
- Detect "Hey Buddy" and variations
- Trigger recording mode
- Visual feedback (border flash + chiptune)

### 2. Grace Period Recording (5s continue window)
- After silence detected, start 5s countdown
- If user speaks during 5s, reset timer and continue
- If 5s pass, finalize and transcribe
- Visual: Telltale-style bar emptying 5→0
- Audio: Chiptune "revive" sound on reset

### 3. Transcription
- Whisper WebGPU (primary)
- Web Speech API fallback
- Remove wake words from transcript

### 4. OpenCode Integration
- Send message via SSE
- Handle streaming response
- Check for session selected (popup if none)

### 5. TTS with Barge-in
- Speak paragraph by paragraph
- Listen for "stop"/"pause" during TTS
- Stop immediately if detected
- Start Quick Listen (15s) after TTS

### 6. Quick Listen Mode (15s)
- After TTS completes, listen for 15s
- If user speaks, send as new message
- If timeout, return to IDLE
- Commands: "never mind" = cancel

### 7. Voice Commands
- "stop", "detente", "para", "quiet" → stop TTS
- "pause", "pausa", "espera" → pause TTS
- "continue", "continua" → resume TTS
- "never mind", "olvida", "cancel" → cancel

## UI Components
- GracePeriodBar: Bottom line emptying (Telltale style)
- SpeakingGlowBorder: Pulsing green border during TTS
- QuickListenBar: Health bar style 15→0 seconds
- CreateSessionPopup: Voice + visual prompt for session creation

## Chiptune Sounds
- Wake word: TARS-style robotic blip
- Start recording: Scanner/sonar slide
- Grace reset: 8-bit "revive" arpeggio
- Processing: Rapid ascending tones
- Success: Three descending notes
- Error: Low buzz

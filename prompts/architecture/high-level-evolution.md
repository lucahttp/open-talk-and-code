# High-Level Architecture Evolution
**Date:** 2026-04-05  
**Source:** Project Implementation History

## Architecture V1: Basic Voice → OpenCode
**Date:** Project Inception → 2026-04-04

```
┌──────────────┐      ┌─────────────┐      ┌─────────────┐
│   HeyBuddy   │─────►│   Whisper   │─────►│  OpenCode   │
│ (Wake Word)  │      │    (STT)    │      │    (LLM)    │
└──────────────┘      └─────────────┘      └──────┬──────┘
                                                   │
                        ┌──────────────────────────┘
                        ▼
                 ┌─────────────┐
                 │     TTS     │
                 └─────────────┘
```

### Components
- **HeyBuddy**: Wake word detection (ONNX)
- **Whisper**: Speech-to-text (WebGPU)
- **OpenCode**: LLM via SSE streaming
- **TTS**: Web Speech API

### Flow
1. "Hey Buddy" detected
2. Record until silence
3. Transcribe with Whisper
4. Send to OpenCode
5. Stream response
6. TTS speaks response
7. Back to idle

### Limitations
- No continue window (if you pause, recording stops)
- No barge-in (can't stop TTS mid-speak)
- No post-TTS listening (have to say "Hey Buddy" again)
- No session handling (fails if no session selected)
- Single audio path (HeyBuddy does everything)

---

## Architecture V2: Grace Period + Barge-in
**Date:** 2026-04-05

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CONVERSATION STATE MACHINE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────────┐     ┌─────────────────────┐     ┌──────────────┐  │
│   │   HeyBuddy   │────►│  GracePeriod        │────►│  Whisper    │  │
│   │ (Wake+Record)│     │  (5s continue)    │     │   (STT)     │  │
│   └──────────────┘     └─────────────────────┘     └──────┬──────┘  │
│          │                                              │           │
│          │                                              ▼           │
│          │                                       ┌──────────────┐  │
│          │                                       │  OpenCode    │  │
│          │                                       │   (LLM)      │  │
│          │                                       └──────┬───────┘  │
│          │                                              │           │
│          │                    ┌─────────────────────────┤           │
│          │                    ▼                         ▼           │
│          │            ┌──────────────┐         ┌──────────────┐    │
│          │            │   BargeIn    │◄────────│     TTS      │    │
│          │            │  (Stop/Pause)│         └──────────────┘    │
│          │            └──────┬───────┘                              │
│          │                   │                                       │
│          │                   ▼                                       │
│          │            ┌──────────────┐                              │
│          └────────────►│ QuickListen  │                              │
│                        │  (15s)     │                              │
│                        └──────────────┘                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### New Components

#### 1. useConversationStateMachine
- Manages all conversation states
- Coordinates transitions
- Provides UI data (timers, paragraph tracking)

#### 2. useGracePeriodProcessor
- Receives audio from HeyBuddy
- Accumulates audio chunks
- 5s grace period logic
- Reset on new audio
- Finalize after 5s silence

#### 3. useBargeInTTS
- TTS with "stop"/"pause" detection
- Paragraph-by-paragraph speaking
- Web Speech API parallel listening
- Interrupt handling

#### 4. useQuickListen
- 15s listening post-TTS
- Command detection ("never mind")
- Auto-send on transcription
- Timeout handling

#### 5. CreateSessionPopup
- Visual + voice prompt
- Handles "no session" error
- Create-and-send flow

### Enhanced Flow
1. "Hey Buddy" detected
2. HeyBuddy records (visualizer active)
3. Silence detected → Grace period 5s starts
4. If speak in 5s → reset, continue
5. If 5s pass → Whisper transcribes
6. If no session → Popup: "Create session?"
7. If yes → Create → Send
8. OpenCode streams response
9. TTS speaks paragraph-by-paragraph
10. During TTS: listening for "stop"
11. If "stop" → Quick Listen 15s
12. If speak in 15s → send new message
13. If timeout → back to idle

### Key Improvements
- ✅ Grace period (continue speaking after pause)
- ✅ Barge-in (stop/pause during TTS)
- ✅ Quick listen (post-TTS without wake word)
- ✅ Session handling (popup + voice)
- ✅ Visualizer always active (no mic conflicts)
- ✅ Chiptune feedback (every action has sound)

### State Machine
```
IDLE → RECORDING → GRACE_PERIOD → TRANSCRIBING
                                      ↓
                              ┌───────┴───────┐
                              ▼               ▼
                         SENDING ────────► SPEAKING
                                            │
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                       INTERRUPTING    PAUSED      QUICK_LISTEN
                              │             │             │
                              └─────────────┴─────────────┘
                                            │
                                            ▼
                                    (loop or IDLE)
```

---

## Architecture V3: Future Enhancements
**Date:** Planned

### Potential Additions
1. **Multi-language support**
   - Spanish wake words ("Oye Buddy")
   - Localized TTS voices
   - Language detection

2. **Persistent sessions**
   - Remember last active session
   - Auto-reconnect on startup
   - Session history

3. **Voice profiles**
   - User voice recognition
   - Personalized responses
   - Multi-user support

4. **Offline mode**
   - Local LLM (Ollama integration)
   - No OpenCode required
   - Fallback when offline

5. **WebContainer integration**
   - Run generated code in-browser
   - Preview websites immediately
   - Live reload on changes

### Technical Debt
- [ ] WebSocket proper implementation
- [ ] FunctionGemma intent classification
- [ ] Mobile responsive (currently desktop-only)
- [ ] Whisper local bundling (no HF download)
- [ ] Proper error boundaries

---

## File Structure Evolution

### V1
```
src/
├── App.jsx
├── hooks/
│   ├── useHeyBuddy.js
│   ├── useTranscriber.js
│   └── useOpenCode.js
└── services/
    ├── HeyBuddy.js
    └── tts.js
```

### V2 (Current)
```
src/
├── App.jsx
├── hooks/
│   ├── useHeyBuddy.js
│   ├── useTranscriber.js
│   ├── useOpenCode.js
│   ├── useTTS.js
│   ├── useConversationStateMachine.js     ← NEW
│   ├── useGracePeriodProcessor.js         ← NEW
│   ├── useBargeInTTS.js                   ← NEW
│   ├── useQuickListen.js                  ← NEW
│   └── useWebSocket.js
├── services/
│   ├── HeyBuddy.js
│   ├── tts.js
│   ├── chiptune.js                      ← NEW
│   └── intent.js
├── components/
│   ├── GracePeriodBar.jsx               ← NEW
│   ├── SpeakingGlowBorder.jsx           ← NEW
│   ├── QuickListenBar.jsx               ← NEW
│   └── CreateSessionPopup.jsx           ← NEW
└── workers/
    └── transcription.worker.js
```

### Stats
- **Lines of Code:** ~1,500 → 2,800
- **Custom Hooks:** 3 → 9
- **Components:** 0 → 4
- **Services:** 2 → 4
- **Build Size:** ~1.2MB (unchanged, code split well)

---

## Performance Characteristics

### Memory Usage
- HeyBuddy models: ~50MB (ONNX in memory)
- Whisper model: ~100MB (loaded on demand)
- Audio buffers: ~10MB max (grace period accumulation)
- Total: ~200MB steady state

### Latency
- Wake word detection: ~200ms
- Grace period: 5s configurable
- Transcription: 1-3s (Whisper), <1s (Web Speech)
- TTS: Real-time streaming
- Total round-trip: 5-15s typical

### Browser Compatibility
- Chrome/Edge: Full support (WebGPU)
- Firefox: Partial (Web Speech fallback)
- Safari: Limited (no WebGPU)
- Mobile: Not supported (WebGPU + UI constraints)

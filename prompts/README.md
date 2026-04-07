# Voice Agent Web - Prompts Index
**Generated:** 2026-04-05  
**Project:** Voice Agent Web for OpenCode

## 📁 Folder Structure

```
prompts/
├── functional/           # Feature requirements & flows
├── non-functional/       # UI/UX, performance, design
├── errors/              # Bug fixes & error resolutions
└── architecture/        # System architecture evolution
```

## 📄 Files by Category

### Functional Requirements (features/)

| File | Description | Date |
|------|-------------|------|
| `conversational-voice-agent-grace-period.md` | Complete voice flow: wake word → grace period → TTS → barge-in → quick listen | 2026-04-05 |
| `create-session-popup-voice.md` | No session selected handling: popup + voice prompt | 2026-04-05 |

### Non-Functional Requirements (non-functional/)

| File | Description | Date |
|------|-------------|------|
| `terminal-ui-ux-design.md` | Terminal aesthetic specs, animations, components styling | 2026-04-05 |

### Error Fixes (errors/)

| File | Description | Date |
|------|-------------|------|
| `circular-dependency-initialization.md` | React hooks initialization order fix using refs | 2026-04-05 |
| `websocket-connection-failed.md` | WebSocket failure handling and graceful degradation | 2026-04-05 |
| `audiocontext-user-gesture.md` | AudioContext browser policy and user interaction requirements | 2026-04-05 |

### Architecture (architecture/)

| File | Description | Date |
|------|-------------|------|
| `high-level-evolution.md` | V1 → V2 → V3 architecture evolution, component diagrams, stats | 2026-04-05 |

## 🔑 Key Concepts

### Grace Period
5-second continue window after silence detected. If user speaks during this window, timer resets and recording continues. Visual: Telltale-style bar. Audio: Chiptune "revive" sound.

### Barge-in
Ability to interrupt TTS by saying "stop" or "pause". Detected via Web Speech API running in parallel with TTS output.

### Quick Listen
15-second listening window after TTS completes. User can speak new command without saying wake word again.

### State Machine
```
IDLE → RECORDING → GRACE_PERIOD → TRANSCRIBING → SENDING → SPEAKING → [INTERRUPTING/PAUSED/QUICK_LISTEN]
```

### Chiptune Feedback
Every action has corresponding sound:
- Wake word: TARS robotic blip
- Recording start: Scanner/sonar slide
- Grace reset: 8-bit "revive" arpeggio
- Processing: Rapid ascending tones
- Success: Three descending notes
- Error: Low buzz

## 📊 Project Stats

- **Total Prompts:** 7 documents
- **Functional Specs:** 2
- **Non-Functional Specs:** 1
- **Error Resolutions:** 3
- **Architecture Docs:** 1

## 🎯 Quick Links

### For New Developers
1. Start with `architecture/high-level-evolution.md` for system overview
2. Read `functional/conversational-voice-agent-grace-period.md` for main flow
3. Check `non-functional/terminal-ui-ux-design.md` for UI specs

### For Debugging
- `errors/circular-dependency-initialization.md` - React hooks patterns
- `errors/audiocontext-user-gesture.md` - Browser audio policies
- `errors/websocket-connection-failed.md` - Network handling

### For Feature Implementation
- `functional/create-session-popup-voice.md` - Session management pattern
- `architecture/high-level-evolution.md` - Where to add new components

## 📝 Source Convention
All prompts include:
- **Date:** When created/updated
- **Source:** Origin (user request, bug report, design session)
- **Error messages:** Actual console errors (if applicable)
- **Code snippets:** Before/after comparison
- **Testing checklist:** Verification steps

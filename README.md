# Voice Agent Web

A browser-based voice interface for [OpenCode](https://opencode.ai) with conversational AI capabilities.

```
         ███             ███             ███             ███            
       ███░            ███░            ███░            ███░            █
     ███░            ███░            ███░            ███░            ███
   ███░            ███░            ███░            ███░            ███░ 
 ███░            ███░            ███░            ███░            ███░   
██░            ███░            ███░            ███░            ███░     
░            ███░            ███░            ███░            ███░       
            ░░░             ░░░             ░░░             ░░░         
     █░█▀█░█▀█░█▀▀░█▀█░░░▀█▀░█▀█░█░░░█░█░░░█▀█░▀░░░█▀▀░█▀█░█▀▄░█▀▀   ███
   ███░█░█░█▀▀░█▀▀░█░█░░░░█░░█▀█░█░░░█▀▄░░░█░█░░░░░█░░░█░█░█░█░█▀▀ ███░ 
 ███░ ░▀▀▀░▀░░░▀▀▀░▀░▀░░░░▀░░▀░▀░▀▀▀░▀░▀░░░▀░▀░░░░░▀▀▀░▀▀▀░▀▀░░▀▀▀██░   
██░            ███░            ███░            ███░            ███░     
░            ███░            ███░            ███░            ███░       
           ███░            ███░            ███░            ███░         
         ███░            ███░            ███░            ███░           
        ░░░             ░░░             ░░░             ░░░             
 ███             ███             ███             ███             ███    
██░            ███░            ███░            ███░            ███░     
░            ███░            ███░            ███░            ███░       
```

## Features

- **"Hey Buddy" Wake Word Detection** - Trigger commands hands-free with ONNX-based wake word detection
- **Grace Period Recording** - 5-second continue window after silence (like OpenCode's double-ESC)
- **Streaming TTS with Barge-in** - Speak responses paragraph-by-paragraph, interrupt with "stop" or "pause"
- **Quick Listen Mode** - 15-second listening window after TTS completes
- **Web Speech API Fallback** - Works even when Whisper fails to load
- **Retro Terminal Aesthetic** - Green-on-black hacker terminal UI

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Voice Agent Web                                          │
│                              (Browser - All Local)                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │                         CONVERSATION STATE MACHINE                            │   │
│   │                                                                             │   │
│   │  ┌──────────┐    wake word     ┌────────────┐    silence    ┌────────────┐  │   │
│   │  │   IDLE   │ ────────────────►│ RECORDING  │────────────►│GRACE_PERIOD│  │   │
│   │  │          │◄─────────────────│            │◄────────────│   (5s)     │  │   │
│   │  └──────────┘   15s timeout    │  (VAD)     │  continue    └─────┬──────┘  │   │
│   │       ▲                        │            │  detected          │        │   │
│   │       │                        └────────────┘                    │        │   │
│   │       │                                    │                     │        │   │
│   │       │                                    ▼                     ▼        │   │
│   │       │                           ┌────────────┐          ┌────────────┐  │   │
│   │       │                           │TRANSCRIBING│          │TRANSCRIBING│  │   │
│   │       │                           │ (Whisper)  │          │ (combined) │  │   │
│   │       │                           └─────┬──────┘          └─────┬──────┘  │   │
│   │       │                                 │                       │        │   │
│   │       │                                 ▼                       │        │   │
│   │       │                           ┌────────────┐                │        │   │
│   │       │                           │  SENDING   │◄───────────────┘        │   │
│   │       │                           │ (OpenCode) │                         │   │
│   │       │                           └─────┬──────┘                         │   │
│   │       │                                 │                                │   │
│   │       │                                 ▼                                │   │
│   │       │                           ┌────────────┐                         │   │
│   │       │              ┌───────────│  SPEAKING  │──────────────────┐      │   │
│   │       │              │           │   (TTS)    │                  │      │   │
│   │       │              │           └────────────┘                  │      │   │
│   │       │              │                  │                        │      │   │
│   │       │       "stop"/"pause"           │                        │      │   │
│   │       │              │                  │ TTS completes         │      │   │
│   │       │              ▼                  ▼                        │      │   │
│   │       │       ┌────────────┐      ┌────────────┐                  │      │   │
│   │       │       │INTERRUPTING│      │QUICK_LISTEN│──────────────────┘      │   │
│   │       │       │            │      │  (15s)     │                         │   │
│   │       │       └─────┬──────┘      └─────┬──────┘                         │   │
│   │       │             │                   │                                │   │
│   │       └─────────────┴───────────────────┘                                │   │
│   │                     │                   │                                  │   │
│   │                     └───────────────────┘                                │   │
│   │                              │                                           │   │
│   │                              ▼                                           │   │
│   │                       ┌────────────┐                                     │   │
│   │                       │  SENDING   │ (loop with new message)            │   │
│   │                       └────────────┘                                     │   │
│   │                                                                             │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │                            AUDIO PIPELINE                                   │   │
│   │                                                                             │   │
│   │   Microphone ──► VAD (Silero) ──► MediaRecorder ──► AudioBuffer ──►      │   │
│   │        │                                                                     │   │
│   │        ├───► Grace Period (5s continue window)                               │   │
│   │        │                                                                     │   │
│   │        ├───► Whisper (WebGPU) ──► Text ──► OpenCode SSE                     │   │
│   │        │                                                                     │   │
│   │        └───► Web Speech API (fallback) ──► Text ──► OpenCode SSE             │   │
│   │                                                                             │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │                          TTS WITH BARGE-IN                                │   │
│   │                                                                             │   │
│   │   OpenCode Response ──► Split Paragraphs ──► Web Speech API Recognition    │   │
│   │        │                              │                    │                 │   │
│   │        ▼                              ▼                    ▼                 │   │
│   │   [Paragraph 1] ──► speak() ──► detect "stop"/"pause" ──► interrupt?       │   │
│   │        │                              │                                      │   │
│   │        │                              ▼                                      │   │
│   │        │                         [Continue to P2] or [Barge-in]             │   │
│   │        │                                                                     │   │
│   │        └───► [Paragraph 2] ──► ... ──► TTS Complete ──► Quick Listen (15s) │   │
│   │                                                                             │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## State Machine

```
                              ┌──────────────────┐
                              │      IDLE        │
                              │  (Wake word      │
                              │   listening)     │
                              └────────┬─────────┘
                                       │ wake word
                                       │ detected
                                       ▼
                              ┌──────────────────┐
         ┌────────────────────│    RECORDING     │
         │   continue          │    (VAD)         │
         │   detected          └────────┬─────────┘
         │                              │ silence
         │                              │ detected
         │                              ▼
         │                    ┌──────────────────┐      ┌─────────────┐
         │                    │  GRACE_PERIOD    │──────│TRANSCRIBING │
         │                    │     (5s)         │ 5s   │  (Whisper)  │
         └────────────────────│                  │──────└──────┬──────┘
                              └──────────────────┘             │
                                                               │ text
                                                               │ ready
                                                               ▼
                              ┌──────────────────┐      ┌─────────────┐
              ┌───────────────│     SPEAKING       │◀─────│   SENDING   │
              │  TTS           │      (TTS)         │      │  (OpenCode) │
              │  complete       └────────┬─────────┘      └─────────────┘
              │                          │
              │                   ┌──────┴──────┐
              │                   ▼             ▼
              │         ┌──────────┐   ┌──────────┐
              │         │"stop"/   │   │ "pause"  │
              │         │"pause"   │   │ command  │
              │         └─────┬────┘   └────┬─────┘
              │               │             │
              │               ▼             ▼
              │      ┌─────────────┐  ┌──────────┐
              └──────│INTERRUPTING │  │  PAUSED  │
                     └──────┬──────┘  └────┬─────┘
                            │              │
                            └───────┬──────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │   QUICK_LISTEN   │
                           │      (15s)       │
                           └────────┬─────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
           timeout  │      speaks   │        "never
            15s    │               │          mind"
                    ▼               ▼               ▼
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │   IDLE   │   │ SENDING  │   │   IDLE   │
              │          │   │  (loop)  │   │          │
              └──────────┘   └──────────┘   └──────────┘
```

## Audio Flow Sequence

```
User                    HeyBuddy         GraceRecorder       Transcriber        OpenCode
 │                         │                   │                  │                │
 │ "Hey Buddy"             │                   │                  │                │
 │────────────────────────►│                   │                  │                │
 │                         │                   │                  │                │
 │                         │ Start Recording   │                  │                │
 │                         │──────────────────►│                  │                │
 │                         │                   │                  │                │
 │ "Create a website..."   │                   │                  │                │
 │────────────────────────────────────────────►│                  │                │
 │                         │                   │                  │                │
 │                         │                   │ VAD silence      │                │
 │                         │                   │ detected         │                │
 │                         │                   │                  │                │
 │                         │                   │ 5s grace period  │                │
 │                         │                   │◄────────────────►│                │
 │                         │                   │                  │                │
 │ "Actually, blue"       │                   │                  │                │
 │────────────────────────────────────────────►│                  │                │
 │                         │                   │ (reset timer)    │                │
 │                         │                   │                  │                │
 │                         │                   │ 5s complete ─────►│ Transcribe    │
 │                         │                   │                  │                │
 │                         │                   │                  │────────────────►│
 │                         │                   │                  │ Send text      │
 │                         │                   │                  │                │
 │                         │                   │                  │◄────────────────│
 │                         │                   │                  │ SSE stream     │
 │                         │                   │                  │                │
 │                         │                   │                  │  Split to TTS  │
 │                         │                   │                  │                │
 │                         │                   │                  │   Paragraphs   │
 │                         │                   │                  │                │
 │                         │                   │                  │ Speak P1       │
 │                         │                   │                  │────────────────►├────► (audio out)
 │                         │                   │                  │                │
 │ "Stop!"                 │                   │                  │                │
 │────────────────────────────────────────────────────────────────────────────────►│
 │                         │                   │                  │ (interrupt)    │
 │                         │                   │                  │                │
 │                         │                   │                  │ Stop TTS       │
 │                         │                   │                  │                │
 │                         │                   │                  │ Quick Listen   │
 │                         │                   │                  │ 15s timer     │
 │                         │                   │                  │                │
 │ "Make it responsive"    │                   │                  │                │
 │────────────────────────────────────────────────────────────────────────────────►│
 │                         │                   │                  │                │
 │                         │                   │                  │ Send to LLM   │
 │                         │                   │                  │────────────────►│
 │                         │                   │                  │                │
```

## UI Components

| Component | State | Visual | Chiptune |
|-----------|-------|--------|----------|
| `GracePeriodBar` | GRACE_PERIOD | Bottom line emptying 5→0 (Telltale style) | `playGracePeriodReset()` on continue |
| `SpeakingGlowBorder` | SPEAKING, QUICK_LISTEN | Pulsing green glow around screen | - |
| `QuickListenBar` | QUICK_LISTEN | Health bar style, 15→0 seconds | - |

## Chiptune Sounds

| Event | Sound | Style |
|-------|-------|-------|
| Wake Word Detected | `playWakeWordDetected()` | TARS robotic blip + whir |
| Start Recording | `playStartRecording()` | Scanner/sonar slide down |
| Grace Period Reset | `playGracePeriodReset()` | 8-bit "revive" arpeggio |
| Processing | `playProcessing()` | Rapid ascending tones |
| Success | `playSuccess()` | Three descending notes |
| Error | `playError()` | Low buzz |

## Voice Commands

### During TTS (Barge-in)
- `"stop"`, `"detente"`, `"para"`, `"quiet"` - Stop TTS, go to quick listen
- `"pause"`, `"pausa"`, `"espera"` - Pause TTS, wait for continue/new command
- `"continue"`, `"continua"` - Resume paused TTS

### During Quick Listen (15s)
- `"never mind"`, `"olvida"`, `"cancel"` - Cancel, return to IDLE
- Any other speech - Send to OpenCode as new message

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Vite 7 + React 19 |
| **Styling** | Tailwind CSS 4 |
| **Wake Word** | Hey Buddy (ONNX models from HuggingFace) |
| **STT** | Whisper WebGPU + Web Speech API fallback |
| **TTS** | Web Speech API |
| **LLM** | OpenCode SSE streaming |
| **Audio** | Web Audio API + chiptune synthesis |

## Custom Hooks

| Hook | Purpose |
|------|---------|
| `useGracePeriodRecorder` | Recording with 5s grace period and VAD |
| `useBargeInTTS` | TTS with "stop"/"pause" detection during speech |
| `useQuickListen` | 15s listening window after TTS |
| `useConversationOrchestrator` | State machine coordinating all hooks |

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

## Environment Variables

```
VITE_HF_TOKEN=hf_xxxxxxxx        # HuggingFace token (optional)
VITE_OPCODE_URL=http://localhost:4096  # OpenCode server URL
```

## Related Links

- [HuggingFace Transformers.js Private Models](https://huggingface.co/docs/transformers.js/en/guides/private)
- [FunctionGemma Fine-tuning](https://github.com/google-gemma/cookbook/blob/main/FunctionGemma/%5BFunctionGemma%5DFinetune_FunctionGemma_270M_for_Mobile_Actions_with_Hugging_Face.ipynb)

## License

MIT

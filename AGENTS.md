# Voice Agent Web - AGENTS.md

This document helps AI agents understand and contribute to the Voice Agent Web codebase.

## Project Overview

**Voice Agent Web** is a standalone web-based voice interface for [OpenCode](https://opencode.ai). It runs entirely in the browser and connects to the local OpenCode server at `localhost:4096`.

### Key Features

- **"Hey Buddy" wake word detection** - Trigger voice commands hands-free
- **Web Speech API fallback** - Works even when Whisper fails to load
- **Real-time streaming** - See OpenCode responses as they generate
- **Local TTS** - Web Speech API keeps everything on your machine
- **Hacker/Terminal aesthetic** - Pure black (#000000) with terminal green (#00ff00)

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Vite 7 + React 19 |
| **Styling** | Tailwind CSS 4 |
| **Animations** | GSAP |
| **AI in Browser** | @huggingface/transformers v3.7.1 |
| **ONNX Runtime** | onnxruntime-web |
| **Wake Word** | Hey Buddy (ONNX models from HuggingFace) |
| **STT** | Whisper WebGPU (with Web Speech API fallback) |
| **TTS** | Web Speech API (browser built-in) |
| **Intent** | Regex-based classification (FunctionGemma disabled) |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Voice Agent Web                           │
│                    (Browser - All Local)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐  │
│  │                    React Frontend                    │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │  │
│  │  │ App.jsx     │  │ useHeyBuddy  │  │ useOpenCode│  │  │
│  │  │ (main UI)   │  │ (wake word)  │  │ (API hook) │  │  │
│  │  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  │  │
│  │         │                │                │          │  │
│  │  ┌──────┴────────────────┴────────────────┴──────┐    │  │
│  │  │              Services                         │    │  │
│  │  │  ┌─────────┐ ┌─────────┐ ┌──────────────┐   │    │  │
│  │  │  │HeyBuddy │ │ intent  │ │ web-speech-  │   │    │  │
│  │  │  │(ONNX)   │ │ (regex) │ │ api.js       │   │    │  │
│  │  │  └────┬────┘ └────┬────┘ └──────────────┘   │    │  │
│  │  │       │           │                         │    │  │
│  │  │  ┌────┴───────────┴─────────────────────────┐│    │  │
│  │  │  │        Web Workers                       ││    │  │
│  │  │  │  ┌─────────────────────────────────┐    ││    │  │
│  │  │  │  │ transcription.worker.js       │    ││    │  │
│  │  │  │  │ (Whisper WebGPU)              │    ││    │  │
│  │  │  │  └─────────────────────────────────┘    ││    │  │
│  │  │  └─────────────────────────────────────────┘│    │  │
│  │  └─────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────┘  │
│                           │                                 │
│                           │ HTTP + SSE                     │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              OpenCode Server :4096                   │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │ /api        │  │ /chat        │  │ /event      │  │  │
│  │  │ (sessions)  │  │ (messages)   │  │ (SSE)       │  │  │
│  │  └─────────────┘  └──────────────┘  └─────────────┘  │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Voice Flow

### Wake Word Detection

```
Microphone
    │
    ▼ (AudioWorklet)
HeyBuddy.js
    │
    ▼ (ONNX inference)
Wake word detected? ──Yes──▶ Flash border (GSAP)
    │                           Play chiptune sound
    No                          Start recording
    │
    ▼ (VAD - Silero)
Silence detected? ──Yes──▶ Stop recording
    │                           Send audio to transcription
    No                          Continue recording
    │
    ▼
Continue listening...
```

### Transcription Flow

```
Recording complete
    │
    ▼ Try Whisper first
Whisper Web Worker
    │
    ├─ Success ──▶ Return transcript
    │
    └─ Fail (HTML error) ──▶ Web Speech API fallback
                                  │
                                  ▼
                         Browser SpeechRecognition
                                  │
                                  ▼
                         Return transcript
```

### Processing Flow

```
Transcript text
    │
    ▼ (Regex intent classification)
intent.js
    │
    ├─ Matches /command ──▶ Execute OpenCode command
    │
    └─ No match ──▶ Send as chat message
                         │
                         ▼
                    OpenCode API
                         │
                         ▼ (SSE streaming)
                    useOpenCode.js
                         │
                    ┌────┴────┐
                    ▼         ▼
              ChatLog     TTS speak()
              (display)   (voice output)
```

## Key Files Reference

### Frontend (`src/`)

| File | Purpose |
|------|---------|
| `App.jsx` | Main UI - terminal aesthetic, visualizers, loading screen |
| `index.css` | Terminal styling, animations, ASCII art |
| `hooks/useHeyBuddy.js` | Hey Buddy wake word detection integration |
| `hooks/useOpenCode.js` | OpenCode API with SSE streaming |
| `hooks/useTranscriber.js` | Whisper + Web Speech API transcription |
| `hooks/useTTS.js` | Web Speech API text-to-speech |
| `services/HeyBuddy.js` | ONNX wake word detection engine |
| `services/intent.js` | Regex-based command classification |
| `services/web-speech-api.js` | Web Speech API fallback wrapper |
| `services/chiptune.js` | TARS-style robotic sound effects |
| `services/opencode-api.js` | HTTP client for OpenCode |
| `workers/transcription.worker.js` | Whisper WebGPU in Web Worker |

### Models (`src/services/models/`)

| File | Purpose |
|------|---------|
| `wake-word.js` | Wake word ONNX model inference |
| `vad.js` | Silero VAD for silence detection |
| `mel-spectrogram.js` | Audio preprocessing |
| `speech-embedding.js` | Speech feature extraction |
| `base.js` | Base ONNX model class |

## State Management

The app uses React hooks for state management (no external state library needed for this scope):

### Local State (useState)

- `settings` - TTS, chiptune, voice preferences (persisted to localStorage)
- `messages` - Chat history from useOpenCode hook
- `transcript` - Current transcription from useTranscriber
- `isListening` - Wake word detection status
- `isRecording` - Audio recording status

### Refs

- `workerRef` - Web Worker for Whisper transcription
- `processedTranscriptsRef` - Tracks already-processed transcripts to avoid duplicates
- `lastMessageRef` - Tracks last spoken message for TTS

## Configuration

### Environment Variables (`.env`)

```
VITE_HF_TOKEN=hf_xxxxxxxx        # HuggingFace token (optional, gated models fail anyway)
VITE_OPCODE_URL=http://localhost:4096  # OpenCode server URL
```

### Hey Buddy Configuration

```javascript
const heyBuddyOptions = {
  debug: false,
  modelPath: WAKE_WORDS.map((word) => 
    `${ROOT_URL}/models/${word.replace(' ', '-')}.onnx`
  ),
  vadModelPath: `${ROOT_URL}/pretrained/silero-vad.onnx`,
  spectrogramModelPath: `${ROOT_URL}/pretrained/mel-spectrogram.onnx`,
  embeddingModelPath: `${ROOT_URL}/pretrained/speech-embedding.onnx`,
};
```

Models are downloaded from HuggingFace (`benjamin-paine/hey-buddy`).

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Important: COOP/COEP Headers

The app requires Cross-Origin headers for WebGPU and SharedArrayBuffer:

```javascript
// vite.config.js
server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
}
```

## Design Decisions

### Why Web Speech API Fallback?

Whisper (via HuggingFace transformers.js) often fails to load due to:
- HuggingFace rate limiting
- Gated model restrictions
- CORS issues with model downloads

Web Speech API is built into browsers and works offline, making it a reliable fallback.

### Why Regex Intent Classification?

FunctionGemma (the intended intent classifier) requires gated model access that consistently fails with 401 errors even with HF_TOKEN. Regex classification is:
- Instant (no model download)
- Reliable (no network dependencies)
- Sufficient for common OpenCode commands

### Why Hey Buddy for Wake Words?

Hey Buddy provides:
- Multiple wake word variations ("Hey Buddy", "Hi Buddy", etc.)
- VAD (Voice Activity Detection) for auto-stop
- ONNX runtime (fast local inference)
- Small model size (~5MB total)

### Why Terminal Aesthetic?

- Fits the developer workflow
- Low distraction (no UI chrome)
- Scales well to different window sizes
- Matches OpenCode's code-focused interface

## Extension Points

### Adding a New Wake Word

1. Add to `WAKE_WORDS` array in `App.jsx`:
   ```javascript
   export const WAKE_WORDS = ["buddy", "hey buddy", "your-word"];
   ```

2. Add color mapping in `COLORS`:
   ```javascript
   "your-word": [R, G, B],
   ```

3. The model will be auto-downloaded from HuggingFace if it exists.

### Adding a New Command Pattern

Edit `src/services/intent.js`:

```javascript
const COMMAND_PATTERNS = {
  '/your-command': ['pattern1', 'pattern2', 'synonym'],
  // ...
};
```

Add parameter extraction in `extractParams()`:

```javascript
case '/your-command':
  const match = text.match(/pattern\s+(.+)/i);
  return { param: match?.[1] };
```

### Adding a New Sound Effect

Edit `src/services/chiptune.js`:

```javascript
playYourSound() {
  const now = this.ctx.currentTime;
  // Create oscillators, set frequencies, add effects
  const osc = this.ctx.createOscillator();
  osc.frequency.setValueAtTime(440, now);
  // ...
}
```

## Known Issues

1. **Whisper fails to load** - HuggingFace returns HTML instead of JSON (rate limiting/gated). Web Speech API fallback handles this.

2. **First transcription delay** - Web Speech API needs permission grant before first use.

3. **Wake word sensitivity** - May trigger on similar-sounding words. Adjust threshold in HeyBuddy options if needed.

4. **React Strict Mode** - Causes duplicate model loading in development (harmless, production is fine).

5. **Safari support** - Web Speech API works but WebGPU features may be limited.

## Testing Changes

Manual testing workflow:

1. Start OpenCode: `opencode serve` (in another terminal)
2. Run the app: `npm run dev`
3. Test wake word: Say "Hey Buddy", verify border flash and chiptune
4. Test transcription: Speak a command, verify text appears
5. Test fallback: If Whisper fails, verify "[FALLBACK]" appears in status
6. Test streaming: Send a message, verify text streams in real-time
7. Test TTS: Verify responses are spoken aloud

## Troubleshooting

### Whisper not loading
- Check browser console for "<!doctype" error
- Verify Web Speech API shows as "✓ FALLBACK" in status bar
- Force Web Speech API via settings toggle

### Wake word not detected
- Check microphone permission in browser
- Verify "Listening" status is active
- Check console for HeyBuddy initialization errors

### No TTS output
- Verify TTS is enabled in settings
- Check browser supports Web Speech API
- Try different voice in settings

## Code Style

- **React**: Functional components with hooks
- **Styling**: Tailwind classes, avoid custom CSS where possible
- **Colors**: Use `text-terminal` (#00ff00) for primary accent
- **Console**: Prefix logs with `[ComponentName]` for debugging

## Completed Tasks

✅ **Next Steps Completed (2026-04-03):**
1. ✅ Implemented Web Speech API fallback for when Whisper fails
2. ✅ Added UI indicator showing which transcription method is active
3. ✅ Added settings toggle to force Web Speech API
4. ✅ Added error toast for transcription failures
5. ✅ Updated loading screen to show fallback methods

## Remaining Tasks

- Test on-demand Whisper loading (may still fail due to HuggingFace restrictions)
- Verify regex intent classification works for all common commands
- Add local model bundling to avoid network dependencies
- Improve mobile responsiveness

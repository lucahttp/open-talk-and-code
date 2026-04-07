# Prompt: No Session Selected - Create Session Popup with Voice
**Date:** 2026-04-05  
**Source:** Bug Fix Session - Console Error Analysis

## Problem Identified
**Error:** `[App] Send failed: Error: No session selected`

The grace period flow was attempting to send messages to OpenCode without checking if a session was selected, causing the send to fail silently.

## Functional Requirements

### 1. Session Check Before Send
- Before calling `sendMessage()`, verify:
  - `connected` (OpenCode connection)
  - `selectedSession` (active session)
- If not connected: TTS "Not connected to OpenCode"
- If no session: Show create session popup

### 2. Create Session Popup (Visual + Voice)
```
┌─ No Session Selected ─┐
│                       │
│ Pending message:      │
│ "what's going on..."  │
│                       │
│ Time remaining: 10s   │
│                       │
│ [CREATE SESSION]      │
│ [CANCEL]              │
└───────────────────────┘
```

### 3. Voice Prompt Mode
- TTS: "No session selected. Would you like to create a new session?"
- QuickListen 10s timer
- Accepted YES commands:
  - "yes", "yeah", "sure", "ok", "okay"
  - "create it", "go ahead", "do it"
- If YES: Create session → Send pending message
- If NO/Timeout: TTS "See you later" → Discard message

### 4. Message Preservation
- Save pending message in `pendingMessageRef`
- Clear only after successful send or explicit cancel
- If user cancels, reset all flags and return to IDLE

### 5. Flow Integration
```
Transcription Ready
    ↓
Check connection? → No → TTS error → Reset
    ↓ Yes
Check session? → Yes → Send normally
    ↓ No
Save pending message
Show popup (visual + voice)
    ↓
User says "yes" → Create session → Send message
User says "no" → TTS "See you later" → Reset
Timeout 10s → TTS "See you later" → Reset
```

## Implementation Details

### Hooks Used
- `useConversationStateMachine` - State management
- `useGracePeriodProcessor` - Audio accumulation
- `useQuickListen` - Voice response detection
- `useOpenCode` - Session creation and message sending

### State Management
```javascript
pendingMessageRef.current = cleanedText;  // Save message
setShowCreateSessionPopup(true);          // Show popup
// ... after user response
sendMessage(pendingMessageRef.current); // Send
pendingMessageRef.current = null;         // Clear
```

### TTS Flow
1. "No session selected. Would you like to create a new session?"
2. (Wait for response)
3. If YES: "Creating new session"
4. If NO/Timeout: "See you later"

## Files Modified
- `App.jsx` - Added session check, popup logic, pending message handling
- `CreateSessionPopup.jsx` - Voice mode UI with timer
- `useQuickListen.js` - Voice command detection

## Testing Checklist
- [ ] Say message without session → popup appears
- [ ] Click "CREATE SESSION & SEND" → session created → message sent
- [ ] Click "CANCEL" → TTS "See you later" → back to IDLE
- [ ] Say "yes" in voice mode → auto-creates and sends
- [ ] Say "no" in voice mode → TTS goodbye → reset
- [ ] Timeout 10s → TTS goodbye → reset

# Error: WebSocket Connection Failed
**Date:** 2026-04-05  
**Source:** Browser Console + User Report

## Error Message
```
WebSocket connection to 'ws://localhost:4096/share_poll?id=...' failed: 
[WebSocket] Error: Event {isTrusted: true, type: 'error', ...}
[WebSocket] Disconnected
[WebSocket] Attempting to reconnect...
```

## Root Cause
OpenCode server may not support WebSocket at the `/share_poll` endpoint, or the endpoint doesn't exist. The WebSocket was trying to connect for live streaming but failing repeatedly.

## Initial Code (Buggy)
```javascript
// Always tried to connect, even without session
const WS_URL = 'ws://localhost:5174/?token=...';  // Wrong port!

useWebSocket(WS_URL);  // Connects immediately, fails constantly
```

## Solution Applied

### 1. Correct Port
```javascript
const WS_URL = selectedSession?.id 
  ? `ws://localhost:4096/share_poll?id=${selectedSession.id}`
  : null;  // Don't connect if no session
```

### 2. Handle Null URL
```javascript
// In useWebSocket.js
const connect = useCallback(() => {
  if (!url) {
    console.log('[WebSocket] No URL provided, skipping connection');
    return;
  }
  // ... connect
}, [url]);
```

### 3. Graceful Degradation
WebSocket is optional - main functionality works via SSE:
- HeyBuddy wake word → works
- Grace period recording → works  
- Transcription → works
- OpenCode SSE streaming → works
- TTS → works

## Impact Assessment
- **Severity:** Low (WebSocket is enhancement, not core)
- **User Impact:** No session sharing, but all voice features work
- **Fix Priority:** Low - can be disabled if problematic

## Current Status
WebSocket still shows errors in console but:
- ✅ Doesn't break voice flow
- ✅ Main features work via HTTP/SSE
- ✅ No user-facing errors
- ⚠️ Console noise (acceptable for now)

## Future Solutions
1. Verify OpenCode WebSocket endpoint documentation
2. Add WebSocket feature flag in settings
3. Implement exponential backoff for reconnection
4. Add "Live Stream: OFF" toggle in UI

## Workaround
If WebSocket errors are annoying, disable in code:
```javascript
// In App.jsx
const USE_WEBSOCKET = false;

const { wsConnected, ... } = USE_WEBSOCKET 
  ? useWebSocket(WS_URL) 
  : { wsConnected: false, ...mockEmpty };
```

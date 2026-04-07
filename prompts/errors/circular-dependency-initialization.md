# Error: Wake Word Callback Initialization Order
**Date:** 2026-04-05  
**Source:** Chrome DevTools Console Error

## Error Message
```
App.jsx:769 Uncaught ReferenceError: Cannot access 'handleWakeWordDetected' before initialization
    at App (App.jsx:769:18)
```

## Root Cause
React hooks initialization order issue. `handleWakeWordDetected` was being used in a `useEffect` before the `useCallback` that defines it was executed.

## Code Pattern Causing Error
```javascript
// BAD - useEffect before useCallback
useEffect(() => {
  if (detectedWakeWord) {
    handleWakeWordDetected();  // ❌ Not defined yet!
  }
}, [wakeWords, handleWakeWordDetected]);

const handleWakeWordDetected = useCallback(() => {
  // ... defined here but used above
}, [deps]);
```

## Solution
Use a ref to break the circular dependency:

```javascript
// GOOD - Using ref
const handleWakeWordDetectedRef = useRef(null);

useEffect(() => {
  if (detectedWakeWord && handleWakeWordDetectedRef.current) {
    handleWakeWordDetectedRef.current();  // ✅ Safe
  }
}, [wakeWords]);

const handleWakeWordDetected = useCallback(() => {
  // ... implementation
}, [deps]);

// Update ref after initialization
useEffect(() => {
  handleWakeWordDetectedRef.current = handleWakeWordDetected;
}, [handleWakeWordDetected]);
```

## Affected Functions (All Fixed)
1. `handleWakeWordDetected` - Wake word detection
2. `processGracePeriodAudio` - Audio processing  
3. `resumeHeyBuddy` - Resume after flow completion

## Pattern Applied
```javascript
// 1. Create ref
const functionRef = useRef(null);

// 2. Use ref in early useEffect/useCallback
useEffect(() => {
  functionRef.current?.();  // Optional chaining for safety
}, [deps]);

// 3. Define actual function
const actualFunction = useCallback(() => {
  // ...
}, [deps]);

// 4. Sync ref after
useEffect(() => {
  functionRef.current = actualFunction;
}, [actualFunction]);
```

## Testing
- [ ] Build succeeds without errors
- [ ] Wake word detection triggers correctly
- [ ] Grace period processing receives audio
- [ ] Resume function works after flow completion

## Prevention
For future hooks:
- If function A depends on B and B depends on A → use ref pattern
- If function is used in useEffect before its definition → use ref
- Always check build output for "Cannot access before initialization"

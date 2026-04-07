# Prompt: Terminal Aesthetic UI/UX Design
**Date:** 2026-04-05  
**Source:** Design Requirements + Implementation

## Non-Functional Requirements

### 1. Visual Style - Terminal/Hacker Aesthetic
- **Primary Color:** `#00ff00` (terminal green)
- **Background:** `#000000` (pure black)
- **Font:** Monospace (Courier New, Consolas)
- **Style:** 1980s terminal, minimal, no gradients

### 2. UI Components Styling

#### GracePeriodBar (Telltale Games style)
```
Fixed bottom of screen
Height: 3px
Color: #00ff00 with opacity 0.8
Animation: Width 100% → 0% in 5s
Box-shadow glow effect
```

#### SpeakingGlowBorder
```
Full screen overlay (pointer-events: none)
Box-shadow: inset 0 0 30px rgba(0, 255, 0, 0.3)
Animation: Pulsing opacity 0.3 → 0.6 every 2s
Active during: SPEAKING and QUICK_LISTEN states
```

#### QuickListenBar
```
Centered above input area
Width: 200px, Height: 3px
Style: Health bar (game UI)
Color gradient: #00ff00 → #009900 as time decreases
Text: "15s" counter beside bar
```

### 3. ASCII Art Header
```
╔═══════════════════════════════════════════════════════════════╗
║  ██╗   ██╗ ██████╗ ██╗ ██████╗███████╗                       ║
║  ██║   ██║██╔═══██╗██║██╔════╝██╔════╝                       ║
║  ... (Voice Agent Web logo)                                  ║
╚═══════════════════════════════════════════════════════════════╝
```

### 4. Animation Requirements
- **Wake Word Flash:** GSAP border flash 0.6s
- **Recording Indicator:** 🔴 Red dot pulse
- **Processing:** ⚡ Yellow pulse animation
- **Grace Period:** Linear progress bar, no easing
- **All transitions:** CSS transition, 0.1-0.3s duration

### 5. Status Indicators
```
Status Bar Format:
[🔇/🔴/⚡] [STATE] [TTS] CONNECTED: [SESSION_NAME]

States:
- 🔇 IDLE (gray)
- 🔴 RECORDING (red pulse)
- ⚡ TRANSCRIBING (yellow pulse)
- ◆ SPEAKING (green)
- ● QUICK_LISTEN (blue pulse)
```

### 6. Responsive Constraints
- **Min Width:** 800px (terminal needs space)
- **Mobile:** Not supported (WebGPU limitations)
- **Height:** Full viewport, no scrolling main UI
- **Chat Log:** Scrollable, max-height flex

### 7. Visual Feedback Rules
- Every state change = visual indicator change
- Every user action = immediate feedback (<100ms)
- Audio + visual always paired (chiptune + animation)
- Error states = red (#ff0000) + error chiptune

### 8. Accessibility (Minimal)
- Focus outlines: 1px solid #00ff00
- ARIA labels on interactive elements
- Keyboard navigation for buttons
- No full WCAG compliance (experimental project)

## CSS Architecture
```css
/* index.css */
.text-terminal { color: #00ff00; }
.bg-terminal { background-color: #00ff00; }
.border-terminal { border-color: #00ff00; }

/* Custom scrollbar */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-thumb { background: #00ff00; }

/* CRT effect (optional) */
.scanlines::before {
  background: repeating-linear-gradient(
    0deg, rgba(0,0,0,0.1), transparent 1px, transparent 2px
  );
}
```

## Design Decisions Log
1. **Why green-on-black?** - Classic terminal aesthetic, low eye strain
2. **Why ASCII art?** - Authentic hacker feel, no image assets needed
3. **Why minimal animations?** - Don't distract from voice interaction
4. **Why monospace?** - Terminal authenticity, code-focused users

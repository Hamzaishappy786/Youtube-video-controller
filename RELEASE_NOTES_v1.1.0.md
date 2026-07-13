# GestureYT v1.1.0 Release Notes

**Released**: January 13, 2026

## What's New

### 🎯 Smart Camera Activation
The camera now only activates when you're watching a video, not on the YouTube homepage. This saves battery and respects your privacy when you're just browsing.

### ⚙️ Settings Popup
Click the extension icon to open a sleek settings popup:
- **Master on/off switch** — disable the extension entirely (stops the camera track)
- **Camera preview toggle** — show/hide the webcam preview window

### 🔒 Enhanced Security & Compliance
- **Bundled MediaPipe runtime** — all 24 MB of MediaPipe is now bundled locally; zero remote code fetches at runtime
- **Two-world architecture** — proper Manifest V3 isolation between the content script (which touches YouTube's DOM and `chrome.*` APIs) and the gesture engine (which owns MediaPipe)
- **Trusted-Types safe** — all DOM manipulation uses `createElement`/`createElementNS`, no `innerHTML`

### 🎨 Better Gesture Recognition
- **Rotation-tolerant fingers** — hand gestures work even if your hand is tilted (uses distance-based detection instead of y-coordinates)
- **Improved fist logic** — must release your fist before you can toggle wake/sleep again (prevents rapid re-triggering)
- **One-shot pause/play** — holding a flat hand no longer machine-guns pause/play; you must release and re-gesture

### ⚡ Performance & UX
- Inference throttled to 15 FPS
- Pauses automatically when your tab is hidden (no wasted CPU)
- Detects YouTube SPA navigation and re-evaluates camera state seamlessly

## Installation

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** → select this folder
4. Allow camera access when prompted

## Upgrade Notes

If you're upgrading from v1.0:
- Your settings (enabled/previewVisible) are migrated automatically via `chrome.storage.local`
- The new architecture is fully backward-compatible; no user action needed

## Known Limitations

- **Speed caps**: YouTube may limit playback rate to 2.0× for non-premium users; the extension falls back gracefully
- **Lighting**: Hand detection works best with moderate to good lighting
- **Distance**: Keep your hand 1–3 feet from the camera for best results

## Gesture Reference

| Gesture | Action |
|---|---|
| ✊ Hold fist 1.5 s | Wake / Sleep toggle |
| 🖐 Flat hand | Pause / Resume |
| ☝ 1 finger | Speed 1.0× |
| ✌ 2 fingers | Speed 2.0× |
| 🤟 3–4 fingers | Speed 3.0–4.0× |
| 👈 Thumb left | Rewind 10 s |
| 👉 Thumb right | Forward 10 s |

## Bug Fixes

- Fixed pause/play "machine-gunning" when holding a flat hand
- Fixed fist toggling repeatedly while held
- Fixed gesture misclassification on tilted hands
- Fixed CPU spikes when tab is hidden

## Feedback

Found a bug or have a suggestion? Open an issue on GitHub.

Enjoy your hands-free YouTube! 🎥✊

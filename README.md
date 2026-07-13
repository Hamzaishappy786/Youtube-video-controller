# GestureYT — Hand-Gesture YouTube Control ✊

A Manifest V3 Chrome extension that lets you control YouTube playback with hand
gestures, powered by **MediaPipe Hands** running fully on-device. No frameworks,
no remote code — vanilla JS + a locally bundled MediaPipe runtime.

---

## Install

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this folder
4. Open any YouTube video and allow camera access when prompted

Requires **Chrome 111+** (for MAIN-world content scripts).

---

## Gestures

The extension starts **asleep** to prevent accidental triggers.

| Gesture | Action |
|---|---|
| ✊ Hold fist **1.5 s** | Toggle **Sleep ↔ Active** (progress ring shows hold) |
| 🖐 Flat hand (5 fingers) | Pause / Resume |
| ☝ 1 finger (index) | Playback speed 1.0× |
| ✌ 2 fingers | Playback speed 2.0× |
| 🤟 3 fingers | Speed 3.0× (falls back to 2× if clamped) |
| 🖖 4 fingers | Speed 4.0× (falls back to 2× if clamped) |
| 👈 Thumb left | Rewind 10 s (repeats while held) |
| 👉 Thumb right | Forward 10 s (repeats while held) |

After **10 s** without a valid gesture, it auto-returns to Sleep.

Click the extension icon for a settings popup: master on/off switch
(stops the camera entirely) and camera-preview visibility.

---

## Architecture

```
manifest.json         MV3 manifest — two content scripts, two worlds
background.js         Service worker: seeds default settings
content.js            ISOLATED world: UI, webcam, state machine, video control
gesture-engine.js     MAIN world: runs MediaPipe, posts landmarks back
styles.css            HUD, PiP preview, status pill styles
popup.html/css/js     Settings popup (chrome.storage-backed)
mediapipe/            Bundled @mediapipe/hands runtime (wasm + models)
icons/                Extension icons
```

**Why two worlds?** Content scripts live in Chrome's *isolated world* and can't
see page globals; MediaPipe's `hands.js` defines a `window.Hands` global. So
`hands.js` + `gesture-engine.js` are injected into the **MAIN** world via the
manifest (`"world": "MAIN"`), while `content.js` stays isolated where it can use
`chrome.storage` and `chrome.runtime`. The two sides talk over
`window.postMessage` with a `__gyt` namespace: the isolated side sends
`INIT/START/STOP`, the engine streams back `LANDMARKS` at ≤15 FPS.

**Why bundle MediaPipe locally?** Loading it from a CDN at runtime is both
fragile (page CSP / Trusted Types can block injected script tags) and
non-compliant with MV3's remote-code policy. Bundling makes it deterministic,
offline-capable, and Web-Store-publishable.

### Reliability details
- **Debounce:** a gesture must be stable for 300 ms before firing.
- **One-shot latch:** a held gesture fires once — no pause/play machine-gunning.
  Thumb seeks are the exception: they repeat every 900 ms for scrubbing.
- **Cooldown:** 1 s between different commands.
- **Fist re-arm:** after toggling wake/sleep you must open your hand before the
  fist gesture counts again.
- **Rotation-tolerant fingers:** extension is judged by tip-vs-PIP distance from
  the wrist, not raw y-coordinates, so a tilted hand still classifies.
- **Performance:** inference throttled to 15 FPS, lite model, single hand,
  paused entirely while the tab is hidden.
- **SPA-aware:** re-attaches the HUD on YouTube's `yt-navigate-finish` event.

---

## Privacy

- The camera is only requested on `www.youtube.com` and only while the
  extension is enabled.
- All processing happens locally in your browser (WASM). No frames, landmarks,
  or any other data ever leave the machine.
- Disabling the extension in the popup stops the camera track entirely
  (the webcam light goes off).

## Troubleshooting

- **"Camera permission needed"** — click the camera icon in Chrome's address
  bar and allow access for youtube.com.
- **Nothing happens** — the extension sleeps by default; hold a fist for 1.5 s
  until the ring completes and the status pill turns green.
- **Gestures misread** — face the camera palm-forward with decent lighting;
  the preview shows the detected skeleton so you can see what the model sees.

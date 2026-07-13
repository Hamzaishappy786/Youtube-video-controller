# Changelog

All notable changes to GestureYT will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-01-13

### Added
- **Smart camera activation**: Camera only turns on when watching a video, stays off on YouTube homepage
- **Popup settings UI**: Master on/off toggle + camera preview visibility toggle
- **Two-world architecture**: Isolated-world content script + MAIN-world MediaPipe engine for better security and Chrome Web Store compliance
- **Bundled MediaPipe runtime**: Full local ~24 MB MediaPipe Hands distribution, zero remote code at runtime
- **Trusted-Types-safe UI**: All DOM manipulation via `createElement`/`createElementNS`, no `innerHTML`
- **Improved gesture classification**: Rotation-tolerant finger detection (distance-based vs. y-coordinate)
- **SPA-aware navigation**: Auto-detects YouTube SPA navigation and re-evaluates camera state

### Fixed
- **Pause/play machine-gunning**: One-shot latch prevents repeated triggers while holding a gesture
- **Fist re-arm logic**: Must release fist before it can toggle wake/sleep again
- **Gesture stability debounce**: 300 ms hold requirement prevents false positives
- **Performance**: Inference throttled to 15 FPS, paused while tab is hidden

### Changed
- Separated manifest into two content scripts for better isolation and MV3 compliance
- Improved cooldown and seek repeat timing for better UX
- Enhanced status pill UI with animated dot indicator

---

## [1.0.0] — 2026-01-12

### Added
- Initial release: hand-gesture control for YouTube
- Gestures: fist (wake/sleep), flat hand (pause/resume), fingers 1-4 (speed), thumb L/R (seek)
- Webcam preview PiP window in bottom-right corner with drag-to-move
- HUD overlay with gesture feedback badges
- Fist-hold progress ring
- Status indicator pill (SLEEP/ACTIVE)
- Settings stored in `chrome.storage.local`

### Tech
- Vanilla JS (ES6+), HTML5, CSS3
- MediaPipe Hands via CDN (v0.4.1675469240)
- Manifest V3, Chrome 111+

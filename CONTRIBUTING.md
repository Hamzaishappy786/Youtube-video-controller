# Contributing to GestureYT

Thanks for your interest in contributing! Here's a quick guide.

## Development Setup

1. Clone the repo
2. No build step required — the extension runs directly from source
3. Load via `chrome://extensions` → Developer mode → Load unpacked

## File Structure

- **Core**: `content.js` (isolated world), `gesture-engine.js` (main world)
- **UI**: `popup.html`, `styles.css`
- **Config**: `manifest.json`, `background.js`
- **Runtime**: `mediapipe/` (bundled locally)

## Making Changes

- **Bug fixes**: Keep it minimal. Test in a live YouTube session.
- **Features**: Open an issue first to discuss scope.
- **Styling**: Update `styles.css` or `popup.css`; test light/dark modes.
- **Gestures**: Tweak constants at the top of `content.js` (GESTURE_HOLD_MS, COOLDOWN_MS, etc.)

## Testing

1. Make your changes
2. Open a YouTube video
3. Hold a fist for 1.5 s to activate
4. Test your gesture/feature
5. Check the webcam preview and status pill respond correctly

## Commits

Keep commits focused and descriptive. Use conventional commit format when possible:
- `feat: add X`
- `fix: resolve Y`
- `docs: update Z`
- `perf: optimize A`

## Publishing a Release

1. Update version in `manifest.json` and `package.json`
2. Update `CHANGELOG.md`
3. Run `npm run build` to create a ZIP
4. Run `npm run tag` to create a git tag
5. Push to GitHub and create a release with the ZIP attached

## Code Style

- No formatting tool required; prefer readability
- Comments only for WHY, not WHAT
- Function names should be clear and concise
- Keep functions under 50 lines where possible

## Questions?

Open an issue on GitHub or reach out directly.

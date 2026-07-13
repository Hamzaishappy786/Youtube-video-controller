/**
 * gesture-engine.js — MAIN-world MediaPipe engine
 *
 * Runs in the page's main world (declared in manifest with "world": "MAIN")
 * so it can use the `Hands` global defined by mediapipe/hands.js, which is
 * injected just before this file.
 *
 * It never touches YouTube's player or chrome.* APIs. Its only job:
 *   1. Wait for an INIT message from the isolated-world content script
 *      (which carries the extension's base URL for locateFile).
 *   2. Run a throttled frame loop over the webcam <video> element that the
 *      content script created (#gestureyt-pip video).
 *   3. Post hand landmarks back via window.postMessage.
 *
 * Message protocol (all messages carry `__gyt: true`):
 *   isolated → main : INIT { baseUrl }, START, STOP
 *   main → isolated : READY, LANDMARKS { landmarks|null }, ERROR { message }
 */

(() => {
  'use strict';

  if (window.__gytEngineLoaded) return;
  window.__gytEngineLoaded = true;

  const TARGET_FPS = 15;
  const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

  let hands = null;
  let initialized = false;
  let running = false;
  let busy = false;          // true while hands.send() is in flight
  let lastFrameTime = 0;

  /**
   * If YouTube ever enforces Trusted Types, raw string assignment to
   * script.src (done inside hands.js when it lazy-loads its WASM) would
   * throw. Registering a permissive default policy pre-empts that.
   * Harmless no-op when TT is not enforced or a default policy exists.
   */
  try {
    if (window.trustedTypes && !window.trustedTypes.defaultPolicy) {
      window.trustedTypes.createPolicy('default', {
        createScriptURL: (url) => url,
        createScript: (s) => s,
        createHTML: (s) => s
      });
    }
  } catch (_) { /* policy name restricted — proceed without it */ }

  /** Post a namespaced message to the isolated-world content script. */
  function post(type, payload = {}) {
    window.postMessage(Object.assign({ __gyt: true, type }, payload), '*');
  }

  /** Locate the webcam preview element created by the content script. */
  function getCamVideo() {
    return document.querySelector('#gestureyt-pip video');
  }

  /** Build and initialize the MediaPipe Hands pipeline. */
  async function initHands(baseUrl) {
    if (initialized) return;
    initialized = true;

    if (typeof window.Hands !== 'function') {
      post('ERROR', { message: 'MediaPipe Hands failed to load.' });
      return;
    }

    try {
      hands = new window.Hands({
        // Every companion file (wasm, tflite, data) resolves to a bundled
        // extension resource — zero network fetches at runtime.
        locateFile: (file) => `${baseUrl}mediapipe/${file}`
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,          // lite model — fastest, fine for gestures
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.55
      });

      hands.onResults((results) => {
        const lm = results.multiHandLandmarks && results.multiHandLandmarks[0];
        post('LANDMARKS', {
          landmarks: lm ? lm.map(p => ({ x: p.x, y: p.y, z: p.z })) : null
        });
      });

      await hands.initialize();
      post('READY');
      requestAnimationFrame(loop);
    } catch (err) {
      post('ERROR', { message: 'MediaPipe init failed: ' + (err && err.message) });
    }
  }

  /** Throttled frame loop. Skips work while stopped, hidden, or mid-send. */
  async function loop(timestamp) {
    requestAnimationFrame(loop);

    if (!running || busy || document.hidden) return;
    if (timestamp - lastFrameTime < FRAME_INTERVAL_MS) return;

    const cam = getCamVideo();
    if (!cam || cam.readyState < 2 || cam.videoWidth === 0) return;

    lastFrameTime = timestamp;
    busy = true;
    try {
      await hands.send({ image: cam });
    } catch (_) {
      // transient failures (tab switch, GPU context loss) — skip frame
    } finally {
      busy = false;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.__gyt !== true) return;

    switch (msg.type) {
      case 'INIT':
        initHands(msg.baseUrl);
        running = true;
        break;
      case 'START':
        running = true;
        break;
      case 'STOP':
        running = false;
        break;
    }
  });
})();

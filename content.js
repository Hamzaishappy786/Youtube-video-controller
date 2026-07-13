/**
 * content.js — GestureYT Controller (isolated world)
 *
 * Owns everything except MediaPipe itself:
 *   • webcam capture + picture-in-picture preview
 *   • gesture classification from landmarks (posted by gesture-engine.js)
 *   • the SLEEP/ACTIVE state machine and debounced command dispatch
 *   • HUD overlay, status pill, settings sync (chrome.storage)
 *
 * State machine:
 *   SLEEP  → hold ✊ fist 1.5 s → ACTIVE
 *   ACTIVE → hold ✊ fist 1.5 s → SLEEP
 *   ACTIVE → 10 s without a valid gesture → SLEEP
 *
 * Command dispatch rules (fixes for v1.0 bugs):
 *   • A gesture must be stable for 300 ms before it can fire.
 *   • A fired gesture will NOT re-fire while held (one-shot per hold) —
 *     except thumb seeks, which repeat every 900 ms for scrubbing.
 *   • Different commands are separated by a 1 s cooldown.
 *   • The fist toggle re-arms only after the fist is released.
 */

(() => {
  'use strict';

  if (window.__gestureYTActive) return;
  window.__gestureYTActive = true;

  // ─────────────────────────────────────────────
  // Tunables
  // ─────────────────────────────────────────────
  const GESTURE_HOLD_MS = 300;    // stability window before a gesture can fire
  const COOLDOWN_MS = 1000;       // min gap between different commands
  const SEEK_REPEAT_MS = 900;     // repeat interval for held thumb seeks
  const FIST_WAKE_MS = 1500;      // fist hold to toggle SLEEP/ACTIVE
  const SLEEP_TIMEOUT_MS = 10000; // auto-sleep after inactivity
  const HUD_SHOW_MS = 1600;
  const SEEK_STEP_S = 10;

  // ─────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────
  let state = 'SLEEP';            // 'SLEEP' | 'ACTIVE'
  let settings = { enabled: true, previewVisible: true };

  let stableGesture = 'NONE';     // gesture currently being held
  let stableSince = 0;
  let firedGesture = null;        // last gesture that fired (one-shot latch)
  let lastFireTime = 0;

  let fistSince = 0;
  let fistArmed = true;           // must release fist before it can toggle again

  let sleepTimer = null;
  let hudTimer = null;
  let engineReady = false;
  let webcamStream = null;
  let initPing = null;

  // DOM refs
  let pipContainer, pipVideo, landmarkCanvas, landmarkCtx;
  let hud, hudBadge, fistRing, ringProgress, statusEl, statusLabel, pipToggleBtn;

  // ─────────────────────────────────────────────
  // Small helpers
  // ─────────────────────────────────────────────

  const getVideo = () => document.querySelector('video.html5-main-video') ||
                         document.querySelector('video');

  const getPlayerContainer = () =>
    document.querySelector('#movie_player') ||
    document.querySelector('.html5-video-container');

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /** Post a namespaced message to the MAIN-world engine. */
  function post(type, payload = {}) {
    window.postMessage(Object.assign({ __gyt: true, type }, payload), '*');
  }

  /** el('div', {id: 'x', className: 'y'}, child1, child2) — innerHTML-free. */
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  // ─────────────────────────────────────────────
  // Gesture classification (rotation-tolerant)
  // ─────────────────────────────────────────────

  /**
   * A finger counts as extended when its tip is meaningfully farther from
   * the wrist than its PIP joint — this works with a tilted hand, unlike
   * naive y-axis comparisons.
   */
  function fingerExtended(lm, pipIdx, tipIdx) {
    return dist(lm[tipIdx], lm[0]) > dist(lm[pipIdx], lm[0]) * 1.15;
  }

  /** Thumb: tip far from the palm center (middle-finger MCP), scaled to hand size. */
  function thumbExtended(lm) {
    const palm = dist(lm[0], lm[9]) || 1e-6;
    return dist(lm[4], lm[9]) / palm > 0.95;
  }

  /**
   * Classify a 21-point MediaPipe hand into one of:
   * FIST, FLAT, 1F, 2F, 3F, 4F, THUMB_LEFT, THUMB_RIGHT, UNKNOWN
   */
  function classifyGesture(lm) {
    const thumb  = thumbExtended(lm);
    const index  = fingerExtended(lm, 6, 8);
    const middle = fingerExtended(lm, 10, 12);
    const ring   = fingerExtended(lm, 14, 16);
    const pinky  = fingerExtended(lm, 18, 20);

    if (!index && !middle && !ring && !pinky) {
      if (!thumb) return 'FIST';
      // Thumb only → directional seek. Landmarks are unmirrored camera
      // coords, but the user sees a mirrored preview, so judge direction
      // in mirrored screen space: screenDx = (1-tip.x) - (1-wrist.x).
      const screenDx = lm[0].x - lm[4].x;
      const palm = dist(lm[0], lm[9]) || 1e-6;
      if (Math.abs(screenDx) / palm < 0.55) return 'UNKNOWN';
      return screenDx < 0 ? 'THUMB_LEFT' : 'THUMB_RIGHT';
    }

    if (index && middle && ring && pinky) return 'FLAT';
    if (index && !middle && !ring && !pinky) return '1F';
    if (index && middle && !ring && !pinky) return '2F';
    if (index && middle && ring && !pinky) return '3F';

    return 'UNKNOWN';
  }

  // ─────────────────────────────────────────────
  // Command dispatch
  // ─────────────────────────────────────────────

  const SEEK_GESTURES = new Set(['THUMB_LEFT', 'THUMB_RIGHT']);

  function executeCommand(gesture) {
    const video = getVideo();
    if (!video) {
      showHUD('⚠ No video found');
      return;
    }

    switch (gesture) {
      case 'FLAT':
        if (video.paused) { video.play(); showHUD('▶ RESUMED'); }
        else { video.pause(); showHUD('⏸ PAUSED'); }
        break;
      case '1F':
        video.playbackRate = 1.0;
        showHUD('⚡ 1.0× Speed');
        break;
      case '2F':
        video.playbackRate = 2.0;
        showHUD('⚡ 2.0× Speed');
        break;
      case '3F':
        setSpeedWithFallback(video, 3.0);
        break;
      case '4F':
        setSpeedWithFallback(video, 4.0);
        break;
      case 'THUMB_LEFT':
        video.currentTime = Math.max(0, video.currentTime - SEEK_STEP_S);
        showHUD(`⏪ −${SEEK_STEP_S}s`);
        break;
      case 'THUMB_RIGHT':
        if (Number.isFinite(video.duration)) {
          video.currentTime = Math.min(video.duration, video.currentTime + SEEK_STEP_S);
        } else {
          video.currentTime += SEEK_STEP_S;
        }
        showHUD(`⏩ +${SEEK_STEP_S}s`);
        break;
    }
  }

  /** Try a high playback rate; fall back to 2.0× if the browser clamps it. */
  function setSpeedWithFallback(video, rate) {
    try {
      video.playbackRate = rate;
      if (Math.abs(video.playbackRate - rate) > 0.1) throw new Error('clamped');
      showHUD(`⚡ ${rate.toFixed(1)}× Speed`);
    } catch (_) {
      console.warn(`[GestureYT] ${rate}× not supported here — falling back to 2.0×.`);
      video.playbackRate = 2.0;
      showHUD('⚡ 2.0× (max)');
    }
  }

  // ─────────────────────────────────────────────
  // State machine
  // ─────────────────────────────────────────────

  function setState(next) {
    if (state === next) return;
    state = next;
    updateStatusUI();
    if (next === 'ACTIVE') {
      resetSleepTimer();
      showHUD('✅ ACTIVE — gestures on');
    } else {
      clearTimeout(sleepTimer);
      showHUD('😴 SLEEP — hold ✊ to wake');
    }
  }

  function resetSleepTimer() {
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => setState('SLEEP'), SLEEP_TIMEOUT_MS);
  }

  /** Wake/sleep fist hold with progress ring; re-arms only after release. */
  function handleFist(gesture, now) {
    if (gesture !== 'FIST') {
      fistSince = 0;
      fistArmed = true;
      hideFistRing();
      return;
    }
    if (!fistArmed) return;

    if (fistSince === 0) fistSince = now;
    const progress = Math.min((now - fistSince) / FIST_WAKE_MS, 1);
    showFistRing(progress);

    if (progress >= 1) {
      fistSince = 0;
      fistArmed = false;   // require release before next toggle
      hideFistRing();
      setState(state === 'SLEEP' ? 'ACTIVE' : 'SLEEP');
    }
  }

  /** Core per-frame gesture handler, fed by engine LANDMARKS messages. */
  function onLandmarks(landmarks) {
    const now = Date.now();

    if (!landmarks) {
      stableGesture = 'NONE';
      firedGesture = null;      // hand released → re-arm one-shot commands
      fistSince = 0;
      fistArmed = true;
      hideFistRing();
      drawLandmarks(null);
      return;
    }

    drawLandmarks(landmarks);
    const gesture = classifyGesture(landmarks);

    // Fist toggling works in both states.
    handleFist(gesture, now);
    if (state === 'SLEEP') return;

    // Debounce: gesture must be held stable before it can fire.
    if (gesture !== stableGesture) {
      stableGesture = gesture;
      stableSince = now;
      return;
    }
    if (now - stableSince < GESTURE_HOLD_MS) return;
    if (gesture === 'FIST' || gesture === 'UNKNOWN') return;

    resetSleepTimer(); // valid gesture activity keeps us awake

    if (gesture === firedGesture) {
      // One-shot latch — only seeks repeat while held.
      if (SEEK_GESTURES.has(gesture) && now - lastFireTime >= SEEK_REPEAT_MS) {
        lastFireTime = now;
        executeCommand(gesture);
      }
      return;
    }

    if (now - lastFireTime < COOLDOWN_MS) return;

    firedGesture = gesture;
    lastFireTime = now;
    executeCommand(gesture);
  }

  // ─────────────────────────────────────────────
  // Landmark preview drawing
  // ─────────────────────────────────────────────

  const BONES = [
    [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],
    [11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]
  ];

  function drawLandmarks(lm) {
    if (!landmarkCtx) return;
    const w = landmarkCanvas.width, h = landmarkCanvas.height;
    landmarkCtx.clearRect(0, 0, w, h);
    if (!lm) return;

    landmarkCtx.strokeStyle = 'rgba(100,220,255,0.75)';
    landmarkCtx.lineWidth = 1.5;
    for (const [a, b] of BONES) {
      landmarkCtx.beginPath();
      landmarkCtx.moveTo((1 - lm[a].x) * w, lm[a].y * h); // mirror x
      landmarkCtx.lineTo((1 - lm[b].x) * w, lm[b].y * h);
      landmarkCtx.stroke();
    }
    landmarkCtx.fillStyle = '#fff';
    for (const p of lm) {
      landmarkCtx.beginPath();
      landmarkCtx.arc((1 - p.x) * w, p.y * h, 2.5, 0, Math.PI * 2);
      landmarkCtx.fill();
    }
  }

  // ─────────────────────────────────────────────
  // UI construction (no innerHTML — Trusted-Types safe)
  // ─────────────────────────────────────────────

  function buildPiP() {
    pipVideo = el('video', { autoplay: true, muted: true, playsInline: true });
    pipVideo.style.transform = 'scaleX(-1)'; // mirror for intuitive feel

    landmarkCanvas = el('canvas', { id: 'gestureyt-landmark-canvas', width: 160, height: 120 });
    landmarkCtx = landmarkCanvas.getContext('2d');

    pipContainer = el('div', { id: 'gestureyt-pip' }, pipVideo, landmarkCanvas);
    document.body.appendChild(pipContainer);
    makeDraggable(pipContainer);
  }

  function buildToggleButton() {
    pipToggleBtn = el('button', { id: 'gestureyt-pip-toggle', title: 'Toggle webcam preview' }, '👁 Camera');
    pipToggleBtn.addEventListener('click', () => {
      const next = !settings.previewVisible;
      chrome.storage.local.set({ previewVisible: next }); // onChanged applies it
    });
    document.body.appendChild(pipToggleBtn);
  }

  function buildStatusPill() {
    const dot = el('span', { className: 'dot' });
    statusLabel = el('span', { className: 'label' }, 'SLEEP');
    statusEl = el('div', { id: 'gestureyt-status', className: 'sleep' }, dot, statusLabel);
    document.body.appendChild(statusEl);
  }

  function buildHUD() {
    const container = getPlayerContainer();
    if (!container) return;

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    hudBadge = el('div', { className: 'badge' });
    hud = el('div', { id: 'gestureyt-hud' }, hudBadge);
    container.appendChild(hud);

    // Progress ring (SVG built with createElementNS — no innerHTML)
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 80 80');
    const mk = (cls) => {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('class', cls);
      c.setAttribute('cx', '40'); c.setAttribute('cy', '40'); c.setAttribute('r', '35');
      return c;
    };
    svg.append(mk('ring-bg'), (ringProgress = mk('ring-progress')));

    const icon = el('span', { className: 'ring-icon' }, '✊');
    fistRing = el('div', { id: 'gestureyt-fist-ring' }, svg, icon);
    container.appendChild(fistRing);
  }

  /** Re-attach HUD if YouTube's SPA navigation replaced the player DOM. */
  function ensureHUD() {
    if (!hud || !hud.isConnected) {
      hud?.remove();
      fistRing?.remove();
      hud = fistRing = null;
      buildHUD();
    }
  }

  // ─────────────────────────────────────────────
  // HUD helpers
  // ─────────────────────────────────────────────

  function showHUD(text) {
    ensureHUD();
    if (!hudBadge) return;
    hudBadge.textContent = text;
    hud.classList.add('visible');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => hud && hud.classList.remove('visible'), HUD_SHOW_MS);
  }

  function showFistRing(progress) {
    ensureHUD();
    if (!fistRing) return;
    fistRing.classList.add('visible');
    ringProgress.style.strokeDashoffset = String(220 * (1 - progress));
  }

  function hideFistRing() {
    fistRing?.classList.remove('visible');
  }

  function updateStatusUI() {
    if (!statusEl) return;
    statusEl.classList.toggle('active', state === 'ACTIVE');
    statusEl.classList.toggle('sleep', state !== 'ACTIVE');
    statusLabel.textContent = state === 'ACTIVE' ? 'ACTIVE' : 'SLEEP';
  }

  function applyPreviewVisibility() {
    pipContainer?.classList.toggle('hidden', !settings.previewVisible);
    if (pipToggleBtn) {
      pipToggleBtn.textContent = settings.previewVisible ? '👁 Camera' : '🚫 Camera';
    }
  }

  // ─────────────────────────────────────────────
  // Drag-to-move PiP
  // ─────────────────────────────────────────────

  function makeDraggable(target) {
    target.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rect = target.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const startLeft = rect.left;
      const startBottom = window.innerHeight - rect.bottom;

      const onMove = (ev) => {
        target.style.left = `${startLeft + ev.clientX - startX}px`;
        target.style.right = 'auto';
        target.style.bottom = `${startBottom - (ev.clientY - startY)}px`;
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ─────────────────────────────────────────────
  // Webcam + engine lifecycle
  // ─────────────────────────────────────────────

  async function startWebcam() {
    if (webcamStream) return true;
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false
      });
      pipVideo.srcObject = webcamStream;
      await pipVideo.play();
      return true;
    } catch (err) {
      console.error('[GestureYT] Webcam access denied:', err);
      showHUD('⚠ Camera permission needed');
      return false;
    }
  }

  function stopWebcam() {
    webcamStream?.getTracks().forEach(t => t.stop());
    webcamStream = null;
    if (pipVideo) pipVideo.srcObject = null;
    drawLandmarks(null);
  }

  /** Handshake: ping INIT until the MAIN-world engine answers READY. */
  function connectEngine() {
    const baseUrl = chrome.runtime.getURL('');
    let tries = 0;
    clearInterval(initPing);
    initPing = setInterval(() => {
      if (engineReady || ++tries > 40) { clearInterval(initPing); return; }
      post('INIT', { baseUrl });
    }, 500);
    post('INIT', { baseUrl });
  }

  async function enable() {
    pipContainer?.classList.remove('hidden');
    statusEl?.classList.remove('hidden');
    pipToggleBtn?.classList.remove('hidden');
    applyPreviewVisibility();
    const ok = await startWebcam();
    if (!ok) return;
    if (engineReady) post('START');
    else connectEngine();
  }

  function disable() {
    post('STOP');
    stopWebcam();
    setState('SLEEP');
    pipContainer?.classList.add('hidden');
    statusEl?.classList.add('hidden');
    pipToggleBtn?.classList.add('hidden');
  }

  // ─────────────────────────────────────────────
  // Messages, settings, lifecycle events
  // ─────────────────────────────────────────────

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.__gyt !== true) return;

    switch (msg.type) {
      case 'READY':
        engineReady = true;
        clearInterval(initPing);
        showHUD('✊ Hold fist 1.5s to activate');
        break;
      case 'LANDMARKS':
        onLandmarks(msg.landmarks);
        break;
      case 'ERROR':
        console.error('[GestureYT]', msg.message);
        showHUD('⚠ ' + msg.message);
        break;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.enabled) {
      settings.enabled = changes.enabled.newValue;
      settings.enabled ? enable() : disable();
    }
    if (changes.previewVisible) {
      settings.previewVisible = changes.previewVisible.newValue;
      applyPreviewVisibility();
    }
  });

  // Pause inference while the tab is hidden; resume on return.
  document.addEventListener('visibilitychange', () => {
    if (!settings.enabled) return;
    post(document.hidden ? 'STOP' : 'START');
  });

  // YouTube SPA navigation — re-attach the HUD once the new player renders.
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(ensureHUD, 1000);
  });

  // ─────────────────────────────────────────────
  // Boot
  // ─────────────────────────────────────────────

  async function boot() {
    const stored = await chrome.storage.local.get({ enabled: true, previewVisible: true });
    settings = stored;

    buildPiP();
    buildToggleButton();
    buildStatusPill();
    buildHUD();
    updateStatusUI();
    applyPreviewVisibility();

    if (settings.enabled) await enable();
    else disable();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

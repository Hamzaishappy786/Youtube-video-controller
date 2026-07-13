/**
 * background.js — Service Worker
 * Seeds default settings on install; everything else lives in the
 * content scripts and popup (settings sync via chrome.storage.onChanged).
 */

const DEFAULTS = { enabled: true, previewVisible: true };

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(null);
  const missing = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (!(key in stored)) missing[key] = value;
  }
  if (Object.keys(missing).length) {
    await chrome.storage.local.set(missing);
  }
});

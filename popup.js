/**
 * popup.js — settings UI
 * Reads/writes chrome.storage.local; the content script reacts via
 * chrome.storage.onChanged, so no messaging is needed.
 */

const DEFAULTS = { enabled: true, previewVisible: true };

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(DEFAULTS);

  for (const key of Object.keys(DEFAULTS)) {
    const box = document.getElementById(key);
    if (!box) continue;
    box.checked = stored[key];
    box.addEventListener('change', () => {
      chrome.storage.local.set({ [key]: box.checked });
    });
  }
});

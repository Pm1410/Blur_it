/**
 * Background Service Worker (Manifest V3)
 * Manages extension state, lifecycle, and default preferences.
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  threshold: 0.5,
  blurAmount: 20,
  stats: {
    scanned: 0,
    blurred: 0
  }
};

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[Local NSFW Shield] Extension installed / updated:", details.reason);
  const current = await chrome.storage.sync.get(null);
  const initial = { ...DEFAULT_SETTINGS, ...current };
  await chrome.storage.sync.set(initial);
  console.log("[Local NSFW Shield] Default settings initialized:", initial);
});

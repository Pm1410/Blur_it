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

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// Listen for cross-origin image fetch requests from content scripts.
// The service worker uses extension host permissions (<all_urls>) to bypass CORS.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "FETCH_IMAGE_DATA") {
    (async () => {
      try {
        const resp = await fetch(request.url);
        if (!resp.ok) {
          throw new Error(`HTTP error ${resp.status}`);
        }
        const blob = await resp.blob();
        const buffer = await blob.arrayBuffer();
        const mimeType = blob.type || "image/jpeg";
        const base64 = arrayBufferToBase64(buffer);
        sendResponse({ success: true, dataUrl: `data:${mimeType};base64,${base64}` });
      } catch (err) {
        console.warn("[Background] Cross-origin fetch failed for:", request.url, err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
});


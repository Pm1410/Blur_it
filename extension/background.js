/**
 * Background Service Worker (Manifest V3)
 * Manages extension state and routes classification requests to the isolated offscreen worker.
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  threshold: 0.35,
  blurAmount: 20,
  vibeCheckEnabled: true,
  textFilterEnabled: true,
  stats: {
    scanned: 0,
    blurred: 0,
    vibeCheckedCount: 0
  }
};

let creatingOffscreenPromise = null;

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL("offscreen.html");
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl]
    });
    if (contexts.length > 0) return;
  }
  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }
  creatingOffscreenPromise = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["WORKERS"],
        justification: "Isolated on-device ONNX WebAssembly inference"
      });
      console.log("[NSFW Shield] Offscreen document created successfully.");
    } catch (err) {
      if (!err.message?.includes("Only a single offscreen")) {
        console.warn("[NSFW Shield] Could not create offscreen doc:", err);
      }
    } finally {
      creatingOffscreenPromise = null;
    }
  })();
  await creatingOffscreenPromise;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[Local NSFW Shield] Extension installed / updated:", details.reason);
  const current = await chrome.storage.sync.get(null);
  const initial = { ...DEFAULT_SETTINGS, ...current };
  await chrome.storage.sync.set(initial);
  await ensureOffscreenDocument();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureOffscreenDocument();
});

async function sendToOffscreen(payload, retries = 5) {
  for (let i = 0; i < retries; i++) {
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    });
    if (res && res.success) {
      return res;
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  return { success: false, error: "Offscreen worker did not respond in time" };
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "CLASSIFY_IMAGE") {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const res = await sendToOffscreen({
          type: "OFFSCREEN_CLASSIFY_URL",
          url: request.url,
          threshold: request.threshold
        });
        sendResponse(res);
      } catch (err) {
        console.error("[Background] Inference routing error:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (request.type === "CLASSIFY_TENSOR") {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const res = await sendToOffscreen({
          type: "OFFSCREEN_CLASSIFY_TENSOR",
          tensorData: request.tensorData,
          threshold: request.threshold
        });
        sendResponse(res);
      } catch (err) {
        console.error("[Background] Tensor routing error:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (request.type === "CHECK_VIBE_BACKEND") {
    (async () => {
      // 1. Try local server first
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        const res = await fetch("http://127.0.0.1:8000/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: request.text }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          sendResponse({ success: true, data });
          return;
        }
      } catch {
        // Local server not running
      }

      // 2. Try Serverless Hugging Face API if token is configured
      try {
        const syncData = await chrome.storage.sync.get(["hfToken"]);
        const token = (syncData && syncData.hfToken) ? syncData.hfToken.trim() : "";

        if (token && !token.includes("PUT_YOUR_TOKEN_HERE")) {
          const authHeader = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
          
          // Call HF BERT toxicity model
          const hfRes = await fetch("https://api-inference.huggingface.co/models/martin-ha/toxic-comment-model", {
            method: "POST",
            headers: { "Authorization": authHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ inputs: request.text })
          });

          if (hfRes.ok) {
            const hfData = await hfRes.json();
            let isToxic = false;
            if (hfData && hfData.length > 0 && Array.isArray(hfData[0])) {
              const toxicScore = hfData[0].find(d => d.label === "toxic");
              if (toxicScore && toxicScore.score > 0.45) isToxic = true;
            }

            if (isToxic) {
              // Call HF BART Detox Rephraser
              let suggestion = request.text;
              try {
                const detoxRes = await fetch("https://api-inference.huggingface.co/models/s-nlp/bart-base-detox", {
                  method: "POST",
                  headers: { "Authorization": authHeader, "Content-Type": "application/json" },
                  body: JSON.stringify({ inputs: request.text })
                });
                if (detoxRes.ok) {
                  const detoxData = await detoxRes.json();
                  if (detoxData && detoxData.length > 0 && detoxData[0].generated_text) {
                    suggestion = detoxData[0].generated_text;
                  }
                }
              } catch {}

              sendResponse({
                success: true,
                data: {
                  status: "toxic",
                  reason: "Hugging Face Serverless AI",
                  rephrase_suggestion: suggestion
                }
              });
              return;
            } else {
              sendResponse({
                success: true,
                data: {
                  status: "safe",
                  reason: "none",
                  rephrase_suggestion: request.text
                }
              });
              return;
            }
          }
        }
      } catch (err) {
        console.debug("[Background] HF Serverless check error:", err);
      }

      // 3. Fallback to on-device engine
      sendResponse({ success: false });
    })();
    return true;
  }
});

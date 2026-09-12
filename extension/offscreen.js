/**
 * Offscreen Document for On-Device ONNX Inference & Image Preprocessing
 * Runs in extension origin (chrome-extension://<id>) completely isolated from host webpage CSP.
 * Uses extension host_permissions (<all_urls>) to fetch cross-origin images without CORS errors.
 */

"use strict";

if (typeof ort !== "undefined" && ort.env && ort.env.wasm) {
  ort.env.wasm.wasmPaths = chrome.runtime.getURL("");
  ort.env.wasm.numThreads = 1;
}

let session = null;
let sessionPromise = null;

const CONFIG = {
  width: 128,
  height: 128,
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225]
};

async function getSession() {
  if (session) return session;
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    try {
      const modelUrl = chrome.runtime.getURL("models/nsfw_model.onnx");
      const resp = await fetch(modelUrl);
      if (!resp.ok) {
        throw new Error(`Failed to fetch model: ${resp.status}`);
      }
      const buffer = await resp.arrayBuffer();
      session = await ort.InferenceSession.create(new Uint8Array(buffer), {
        executionProviders: ["wasm"]
      });
      console.log("[NSFW Shield Offscreen] ONNX session ready.");
      return session;
    } catch (err) {
      console.error("[NSFW Shield Offscreen] Failed to load ONNX model:", err);
      sessionPromise = null;
      throw err;
    }
  })();

  return sessionPromise;
}

function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - maxLogit));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / sumExps);
}

/**
 * Fetch and preprocess an image URL into a normalized (1, 3, 128, 128) Float32Array
 */
async function preprocessFromUrl(imageUrl) {
  let url = imageUrl;
  if (url.startsWith("//")) {
    url = "https:" + url;
  }

  let blob;
  if (url.startsWith("data:")) {
    const res = await fetch(url);
    blob = await res.blob();
  } else {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Image fetch failed with HTTP ${resp.status}`);
    }
    blob = await resp.blob();
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(CONFIG.width, CONFIG.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, CONFIG.width, CONFIG.height);

  const imgData = ctx.getImageData(0, 0, CONFIG.width, CONFIG.height).data;
  const numPixels = CONFIG.width * CONFIG.height;
  const planar = new Float32Array(3 * numPixels);

  for (let i = 0; i < numPixels; i++) {
    const r = imgData[i * 4] / 255.0;
    const g = imgData[i * 4 + 1] / 255.0;
    const b = imgData[i * 4 + 2] / 255.0;

    planar[i] = (r - CONFIG.mean[0]) / CONFIG.std[0];
    planar[numPixels + i] = (g - CONFIG.mean[1]) / CONFIG.std[1];
    planar[2 * numPixels + i] = (b - CONFIG.mean[2]) / CONFIG.std[2];
  }

  return planar;
}

async function runModel(tensorData, threshold = 0.35) {
  const activeSession = await getSession();
  const inputTensor = new ort.Tensor("float32", new Float32Array(tensorData), [1, 3, 128, 128]);
  const feeds = { [activeSession.inputNames[0]]: inputTensor };
  const results = await activeSession.run(feeds);
  const outputTensor = results[activeSession.outputNames[0]];
  const probabilities = softmax(Array.from(outputTensor.data));

  const pSafe = probabilities[0];
  const pNsfw = probabilities[1];
  const pGraphic = probabilities[2];
  const pUnsafe = 1.0 - pSafe;

  let topClass = "safe";
  let topProb = pSafe;
  if (pNsfw > topProb) {
    topClass = "nsfw";
    topProb = pNsfw;
  }
  if (pGraphic > topProb) {
    topClass = "graphic";
    topProb = pGraphic;
  }

  const isUnsafe = pUnsafe >= threshold;

  return {
    isUnsafe,
    topClass,
    confidence: topProb,
    probabilities: {
      safe: pSafe,
      nsfw: pNsfw,
      graphic: pGraphic,
      unsafe: pUnsafe
    }
  };
}

// Pre-warm ONNX session
getSession().catch(() => {});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "OFFSCREEN_CLASSIFY_URL") {
    (async () => {
      try {
        const tensorData = await preprocessFromUrl(request.url);
        const result = await runModel(tensorData, request.threshold);
        sendResponse({ success: true, result });
      } catch (err) {
        console.warn("[NSFW Shield Offscreen] Classification failed for:", request.url, err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message port open
  }

  if (request.type === "OFFSCREEN_CLASSIFY_TENSOR") {
    (async () => {
      try {
        const result = await runModel(request.tensorData, request.threshold);
        sendResponse({ success: true, result });
      } catch (err) {
        console.warn("[NSFW Shield Offscreen] Tensor inference error:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});

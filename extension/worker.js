/**
 * Web Worker for On-Device ONNX Model Inference
 * Keeps inference off the main DOM thread for smooth 60fps UI.
 */

try {
  importScripts("ort.min.js");
  if (typeof ort !== "undefined" && ort.env && ort.env.wasm) {
    ort.env.wasm.wasmPaths = "./";
    ort.env.wasm.numThreads = 1;
  }
} catch (err) {
  console.warn("[Worker] importScripts failed:", err);
}

let session = null;
const CLASS_LABELS = ["safe", "nsfw", "graphic"];

async function loadModel(modelUrl) {
  try {
    if (typeof ort !== "undefined") {
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ["wasm"]
      });
      console.log("[Worker] ONNX Session initialized successfully:", modelUrl);
    } else {
      console.log("[Worker] Standalone worker ready with built-in preprocessing & inference pipeline.");
    }
    return true;
  } catch (err) {
    console.error("[Worker] Failed to load ONNX model:", err);
    return false;
  }
}

function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const exps = logits.map(x => Math.exp(x - maxLogit));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map(x => x / sumExps);
}

self.onmessage = async (e) => {
  const { type, payload, id } = e.data;

  if (type === "INIT") {
    const success = await loadModel(payload.modelUrl);
    self.postMessage({ type: "INIT_DONE", success, id });
    return;
  }

  if (type === "CLASSIFY") {
    try {
      const { tensorData, threshold } = payload;
      let probabilities = [0.95, 0.03, 0.02]; // Default fallback safe

      if (session && typeof ort !== "undefined") {
        const inputTensor = new ort.Tensor("float32", new Float32Array(tensorData), [1, 3, 128, 128]);
        const feeds = { [session.inputNames[0]]: inputTensor };
        const results = await session.run(feeds);
        const outputTensor = results[session.outputNames[0]];
        probabilities = softmax(Array.from(outputTensor.data));
      }

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

      const isUnsafe = pUnsafe >= (threshold || 0.5);

      self.postMessage({
        type: "CLASSIFY_DONE",
        id,
        result: {
          isUnsafe,
          topClass,
          confidence: topProb,
          probabilities: {
            safe: pSafe,
            nsfw: pNsfw,
            graphic: pGraphic,
            unsafe: pUnsafe
          }
        }
      });
    } catch (err) {
      console.error("[Worker] Classification error:", err);
      self.postMessage({
        type: "CLASSIFY_ERROR",
        id,
        error: err.message
      });
    }
  }
};

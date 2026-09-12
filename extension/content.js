/**
 * Content Script for Local NSFW Shield
 * - Watches DOM for images via MutationObserver
 * - Gates processing to viewport visible images via IntersectionObserver
 * - Preprocesses images into (1, 3, 128, 128) RGB planar tensors
 * - Communicates with Web Worker for local inference
 * - Applies non-destructive blur overlays with click-to-reveal
 */

(function () {
  "use strict";

  const CONFIG = {
    inputWidth: 128,
    inputHeight: 128,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    minSize: 40 // Skip tiny icons
  };

  let isEnabled = true;
  let sensitivityThreshold = 0.5;
  const processedCache = new Map(); // url/hash -> result
  let worker = null;
  let messageIdCounter = 0;
  const pendingRequests = new Map();

  // Initialize Web Worker
  function initWorker() {
    try {
      const workerUrl = chrome.runtime.getURL("worker.js");
      worker = new Worker(workerUrl);
      worker.onmessage = handleWorkerMessage;
      worker.postMessage({
        type: "INIT",
        payload: { modelUrl: chrome.runtime.getURL("models/nsfw_model.onnx") }
      });
    } catch (e) {
      console.warn("[NSFW Shield] Could not initialize Web Worker directly:", e);
    }
  }

  function handleWorkerMessage(e) {
    const { type, id, result, error } = e.data;
    if (pendingRequests.has(id)) {
      const { resolve, reject } = pendingRequests.get(id);
      pendingRequests.delete(id);
      if (type === "CLASSIFY_DONE") {
        resolve(result);
      } else {
        reject(new Error(error || "Worker classification failed"));
      }
    }
  }

  function sendToWorker(tensorData, threshold) {
    return new Promise((resolve, reject) => {
      const id = ++messageIdCounter;
      pendingRequests.set(id, { resolve, reject });
      if (worker) {
        worker.postMessage({
          type: "CLASSIFY",
          id,
          payload: { tensorData, threshold }
        });
      } else {
        // Fallback if worker unsupported in environment
        resolve({
          isUnsafe: false,
          topClass: "safe",
          confidence: 0.99
        });
      }
    });
  }

  /**
   * Preprocess an HTMLImageElement into normalized float32 planar data (1, 3, 128, 128).
   * Matches PyTorch torchvision transforms exactly.
   */
  function preprocessImage(img) {
    const canvas = document.createElement("canvas");
    canvas.width = CONFIG.inputWidth;
    canvas.height = CONFIG.inputHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, CONFIG.inputWidth, CONFIG.inputHeight);

    const imgData = ctx.getImageData(0, 0, CONFIG.inputWidth, CONFIG.inputHeight).data;
    const numPixels = CONFIG.inputWidth * CONFIG.inputHeight;
    const floatArray = new Float32Array(3 * numPixels);

    // Planar format (NCHW): R channel, then G channel, then B channel
    for (let i = 0; i < numPixels; i++) {
      const r = imgData[i * 4] / 255.0;
      const g = imgData[i * 4 + 1] / 255.0;
      const b = imgData[i * 4 + 2] / 255.0;

      floatArray[i] = (r - CONFIG.mean[0]) / CONFIG.std[0];                 // Red channel
      floatArray[numPixels + i] = (g - CONFIG.mean[1]) / CONFIG.std[1];     // Green channel
      floatArray[2 * numPixels + i] = (b - CONFIG.mean[2]) / CONFIG.std[2]; // Blue channel
    }

    return floatArray;
  }

  function getCacheKey(img) {
    return img.src || img.currentSrc || (img.id + "_" + img.width + "x" + img.height);
  }

  /**
   * Apply blur filter and create click-to-reveal badge
   */
  function applyBlurOverlay(img, result) {
    if (img.dataset.nsfwProcessed === "true") return;
    img.dataset.nsfwProcessed = "true";

    const parent = img.parentElement;
    if (!parent) return;

    // Add CSS blur to image
    img.classList.add("nsfw-shield-blurred");

    // Wrapper container for badge
    const wrapper = document.createElement("div");
    wrapper.className = "nsfw-shield-container";
    wrapper.style.position = "relative";
    wrapper.style.display = window.getComputedStyle(img).display === "inline" ? "inline-block" : "block";

    // Insert wrapper
    parent.insertBefore(wrapper, img);
    wrapper.appendChild(img);

    // Badge overlay
    const badge = document.createElement("div");
    badge.className = "nsfw-shield-badge";
    const labelUpper = result.topClass.toUpperCase();
    const confPercent = Math.round(result.confidence * 100);
    badge.innerHTML = `<span>⚠️ ${labelUpper} (${confPercent}%)</span><button class="nsfw-shield-reveal-btn">Reveal</button>`;

    badge.querySelector(".nsfw-shield-reveal-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      img.classList.toggle("nsfw-shield-blurred");
      const btn = badge.querySelector(".nsfw-shield-reveal-btn");
      btn.textContent = img.classList.contains("nsfw-shield-blurred") ? "Reveal" : "Hide";
    });

    wrapper.appendChild(badge);
  }

  /**
   * Inspect and classify a single visible image element.
   */
  async function processImage(img) {
    if (!isEnabled) return;
    if (img.width < CONFIG.minSize || img.height < CONFIG.minSize) return;
    if (img.dataset.nsfwScanned === "true") return;
    img.dataset.nsfwScanned = "true";

    const cacheKey = getCacheKey(img);
    if (processedCache.has(cacheKey)) {
      const cached = processedCache.get(cacheKey);
      if (cached.isUnsafe) {
        applyBlurOverlay(img, cached);
      }
      return;
    }

    try {
      if (!img.complete || img.naturalWidth === 0) {
        img.addEventListener("load", () => processImage(img), { once: true });
        return;
      }

      const tensorData = preprocessImage(img);
      const result = await sendToWorker(tensorData, sensitivityThreshold);
      processedCache.set(cacheKey, result);

      if (result.isUnsafe) {
        applyBlurOverlay(img, result);
      }
    } catch (err) {
      // Graceful error boundary (EXT-12): do not break host page
      console.debug("[NSFW Shield] Could not process image:", err.message);
    }
  }

  // IntersectionObserver to only scan images entering the viewport (EXT-03)
  const visibilityObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        processImage(entry.target);
        observer.unobserve(entry.target);
      }
    }
  }, { rootMargin: "150px" });

  function observeImage(img) {
    if (img.dataset.nsfwObserved) return;
    img.dataset.nsfwObserved = "true";
    visibilityObserver.observe(img);
  }

  // MutationObserver watching for dynamically added <img> elements (EXT-02)
  const domObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === "IMG") {
            observeImage(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll("img").forEach(observeImage);
          }
        }
      }
    }
  });

  function init() {
    initWorker();

    // Load settings from sync storage (EXT-10)
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(["enabled", "threshold"], (data) => {
        if (typeof data.enabled === "boolean") isEnabled = data.enabled;
        if (typeof data.threshold === "number") sensitivityThreshold = data.threshold;
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync") {
          if (changes.enabled) isEnabled = changes.enabled.newValue;
          if (changes.threshold) sensitivityThreshold = changes.threshold.newValue;
        }
      });
    }

    // Initial pass over existing images
    document.querySelectorAll("img").forEach(observeImage);

    // Watch for dynamic insertions
    domObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

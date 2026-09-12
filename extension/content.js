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
  let session = null;
  let sessionPromise = null;

  function softmax(logits) {
    const maxLogit = Math.max(...logits);
    const exps = logits.map((x) => Math.exp(x - maxLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    return exps.map((x) => x / sumExps);
  }

  async function getSession() {
    if (session) return session;
    if (sessionPromise) return sessionPromise;

    sessionPromise = (async () => {
      try {
        if (typeof ort !== "undefined" && ort.env && ort.env.wasm) {
          ort.env.wasm.wasmPaths = chrome.runtime.getURL("");
          ort.env.wasm.numThreads = 1;
        }

        const modelUrl = chrome.runtime.getURL("models/nsfw_model.onnx");
        const resp = await fetch(modelUrl);
        const buffer = await resp.arrayBuffer();

        session = await ort.InferenceSession.create(new Uint8Array(buffer), {
          executionProviders: ["wasm"]
        });
        console.log("[NSFW Shield] On-device ONNX session initialized successfully.");
        return session;
      } catch (err) {
        console.warn("[NSFW Shield] Could not initialize direct ONNX session:", err);
        return null;
      }
    })();

    return sessionPromise;
  }

  async function classifyTensor(tensorData, threshold) {
    try {
      const activeSession = await getSession();
      if (!activeSession || typeof ort === "undefined") {
        return { isUnsafe: false, topClass: "safe", confidence: 0.99 };
      }

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

      const isUnsafe = pUnsafe >= (threshold || sensitivityThreshold);

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
    } catch (err) {
      console.warn("[NSFW Shield] Classification error:", err);
      return { isUnsafe: false, topClass: "safe", confidence: 0.99 };
    }
  }

  /**
   * Preprocess an HTMLImageElement into normalized float32 planar data (1, 3, 128, 128).
   * Handles cross-origin images gracefully.
   */
  async function preprocessImage(img) {
    const canvas = document.createElement("canvas");
    canvas.width = CONFIG.inputWidth;
    canvas.height = CONFIG.inputHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    let drawSuccess = false;
    try {
      ctx.drawImage(img, 0, 0, CONFIG.inputWidth, CONFIG.inputHeight);
      // Probe for canvas tainting
      ctx.getImageData(0, 0, 1, 1);
      drawSuccess = true;
    } catch (taintErr) {
      const targetUrl = img.currentSrc || img.src;
      if (targetUrl) {
        // Fallback 1: Try in-page fetch (works if CDN supports CORS)
        try {
          const resp = await fetch(targetUrl);
          const blob = await resp.blob();
          const bitmap = await createImageBitmap(blob);
          ctx.clearRect(0, 0, CONFIG.inputWidth, CONFIG.inputHeight);
          ctx.drawImage(bitmap, 0, 0, CONFIG.inputWidth, CONFIG.inputHeight);
          ctx.getImageData(0, 0, 1, 1);
          drawSuccess = true;
        } catch (fetchErr) {
          // Fallback 2: Page CORS blocked fetch. Request background service worker
          // (which has <all_urls> host_permissions) to fetch and return clean data URL.
          try {
            const bgResponse = await new Promise((resolve) => {
              chrome.runtime.sendMessage(
                { type: "FETCH_IMAGE_DATA", url: targetUrl },
                (res) => resolve(res || { success: false })
              );
            });

            if (bgResponse && bgResponse.success && bgResponse.dataUrl) {
              const cleanImg = new Image();
              await new Promise((resolve, reject) => {
                cleanImg.onload = resolve;
                cleanImg.onerror = reject;
                cleanImg.src = bgResponse.dataUrl;
              });
              ctx.clearRect(0, 0, CONFIG.inputWidth, CONFIG.inputHeight);
              ctx.drawImage(cleanImg, 0, 0, CONFIG.inputWidth, CONFIG.inputHeight);
              ctx.getImageData(0, 0, 1, 1);
              drawSuccess = true;
            }
          } catch (bgErr) {
            console.debug("[NSFW Shield] Background proxy fetch failed:", bgErr);
          }
        }
      }
    }

    if (!drawSuccess) {
      throw new Error("Canvas rendering or image read access failed");
    }

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

    // If inside a <picture> tag, wrap the picture element to preserve HTML5 picture semantics
    let targetElement = img;
    if (img.parentElement && img.parentElement.tagName === "PICTURE") {
      targetElement = img.parentElement;
    }
    const parent = targetElement.parentElement;
    if (!parent) return;

    // Add CSS blur to image
    img.classList.add("nsfw-shield-blurred");

    // Don't re-wrap if container already exists
    if (targetElement.parentElement && targetElement.parentElement.classList.contains("nsfw-shield-container")) {
      return;
    }

    // Wrapper container for badge
    const wrapper = document.createElement("div");
    wrapper.className = "nsfw-shield-container";
    wrapper.style.position = "relative";
    const compDisplay = window.getComputedStyle(targetElement).display;
    wrapper.style.display = compDisplay === "inline" ? "inline-block" : compDisplay;

    // Insert wrapper
    parent.insertBefore(wrapper, targetElement);
    wrapper.appendChild(targetElement);

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
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w < CONFIG.minSize || h < CONFIG.minSize) return;

    const cacheKey = getCacheKey(img);
    if (img.dataset.nsfwScanned === "true" && img.dataset.lastScannedKey === cacheKey) return;
    img.dataset.nsfwScanned = "true";
    img.dataset.lastScannedKey = cacheKey;

    if (processedCache.has(cacheKey)) {
      const cached = processedCache.get(cacheKey);
      if (cached.isUnsafe) {
        applyBlurOverlay(img, cached);
      }
      return;
    }

    try {
      if (!img.complete || (img.naturalWidth === 0 && img.width === 0)) {
        img.addEventListener("load", () => processImage(img), { once: true });
        return;
      }

      const tensorData = await preprocessImage(img);
      const result = await classifyTensor(tensorData, sensitivityThreshold);
      processedCache.set(cacheKey, result);

      // Track statistics in storage
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(["scannedCount", "blurredCount"], (d) => {
          chrome.storage.local.set({
            scannedCount: (d.scannedCount || 0) + 1,
            blurredCount: (d.blurredCount || 0) + (result.isUnsafe ? 1 : 0)
          });
        });
      }

      console.debug(`[NSFW Shield] ${result.topClass.toUpperCase()} (${Math.round(result.confidence * 100)}%) | Unsafe: ${(result.probabilities.unsafe * 100).toFixed(1)}%`, img.src || img);

      if (result.isUnsafe) {
        console.warn(`[NSFW Shield] ⚠️ Blurring image: ${result.topClass.toUpperCase()} (${Math.round(result.confidence * 100)}%)`, img.src || img);
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
    if (img.dataset.nsfwObserved === "true") return;
    img.dataset.nsfwObserved = "true";
    visibilityObserver.observe(img);

    if (img.complete && (img.naturalWidth > 0 || img.width > 0)) {
      processImage(img);
    } else {
      img.addEventListener("load", () => processImage(img), { once: true });
    }
  }

  // MutationObserver watching for dynamically added <img> elements (EXT-02) and src mutations (lazy loading)
  const domObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === "IMG") {
              observeImage(node);
            } else if (node.querySelectorAll) {
              node.querySelectorAll("img").forEach(observeImage);
            }
          }
        }
      } else if (mutation.type === "attributes" && mutation.target.tagName === "IMG") {
        const img = mutation.target;
        const currentKey = getCacheKey(img);
        if (img.dataset.lastScannedKey !== currentKey) {
          img.dataset.nsfwScanned = "false";
          observeImage(img);
        }
      }
    }
  });

  function init() {
    document.documentElement.dataset.nsfwShieldActive = "true";
    console.log("[NSFW Shield] Monitoring active on:", window.location.href);
    getSession(); // Pre-warm the ONNX session

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

    // Watch for dynamic insertions and lazy loading attribute changes
    domObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset"]
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

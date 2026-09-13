/**
 * Content Script for Local NSFW Shield
 * - Scans DOM images and dynamically added elements
 * - Resolves image URLs and delegates on-device classification to extension offscreen worker
 * - Applies non-destructive CSS blur with click-to-reveal badge
 */

(function () {
  "use strict";

  const CONFIG = {
    minSize: 40 // Skip tiny icons, emojis, tracking pixels
  };

  let isEnabled = true;
  let sensitivityThreshold = 0.30;
  const processedCache = new Map(); // url -> result

  function resolveUrl(rawUrl) {
    if (!rawUrl) return "";
    try {
      return new URL(rawUrl, window.location.href).href;
    } catch {
      if (rawUrl.startsWith("//")) return window.location.protocol + rawUrl;
      return rawUrl;
    }
  }

  /**
   * Apply blur filter and create click-to-reveal badge
   */
  function applyBlurOverlay(img, result) {
    if (img.dataset.nsfwBlurred === "true") return;
    img.dataset.nsfwBlurred = "true";

    // Directly apply inline style blur to guarantee override
    img.style.setProperty("filter", "blur(28px) brightness(0.8)", "important");
    img.style.setProperty("transition", "filter 0.25s cubic-bezier(0.4, 0, 0.2, 1)", "important");
    img.classList.add("nsfw-shield-blurred");

    // Check if wrapper already exists
    let wrapper = img.closest(".nsfw-shield-container");
    if (!wrapper) {
      let targetElement = img;
      if (img.parentElement && img.parentElement.tagName === "PICTURE") {
        targetElement = img.parentElement;
      }
      const parent = targetElement.parentElement;
      if (!parent) return;

      wrapper = document.createElement("div");
      wrapper.className = "nsfw-shield-container";
      wrapper.style.position = "relative";
      const compDisplay = window.getComputedStyle(targetElement).display;
      wrapper.style.display = compDisplay === "inline" ? "inline-block" : compDisplay;

      parent.insertBefore(wrapper, targetElement);
      wrapper.appendChild(targetElement);
    }

    // Create sleek, discreet unblur toggle (zero explicit labels/percentages)
    const overlayBtn = document.createElement("button");
    overlayBtn.type = "button";
    overlayBtn.className = "blur-it-toggle-btn";
    overlayBtn.setAttribute("aria-label", "Toggle image visibility");
    
    const eyeOpenSvg = `<svg class="blur-it-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const eyeClosedSvg = `<svg class="blur-it-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

    overlayBtn.innerHTML = `${eyeOpenSvg}<span class="blur-it-btn-text">Show</span>`;

    overlayBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const currentFilter = img.style.getPropertyValue("filter");
      if (currentFilter && currentFilter.includes("blur")) {
        // Unblur
        img.style.setProperty("filter", "none", "important");
        img.classList.remove("nsfw-shield-blurred");
        overlayBtn.classList.add("blur-it-revealed");
        overlayBtn.innerHTML = `${eyeClosedSvg}<span class="blur-it-btn-text">Hide</span>`;
      } else {
        // Re-blur
        img.style.setProperty("filter", "blur(28px) brightness(0.85)", "important");
        img.classList.add("nsfw-shield-blurred");
        overlayBtn.classList.remove("blur-it-revealed");
        overlayBtn.innerHTML = `${eyeOpenSvg}<span class="blur-it-btn-text">Show</span>`;
      }
    });

    wrapper.appendChild(overlayBtn);
  }

  /**
   * Classify a single image element
   */
  async function processImage(img) {
    if (!isEnabled) return;

    // Check if the image has finished loading
    if (!img.complete || (img.naturalWidth === 0 && img.width === 0)) {
      img.addEventListener("load", () => processImage(img), { once: true });
      return;
    }

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w < CONFIG.minSize || h < CONFIG.minSize) return;

    const rawUrl = img.currentSrc || img.src;
    if (!rawUrl) return;

    const fullUrl = resolveUrl(rawUrl);
    if (!fullUrl) return;

    if (img.dataset.nsfwScanned === "true" && img.dataset.lastScannedUrl === fullUrl) return;

    // Check cache
    if (processedCache.has(fullUrl)) {
      const cached = processedCache.get(fullUrl);
      img.dataset.nsfwScanned = "true";
      img.dataset.lastScannedUrl = fullUrl;
      if (cached.isUnsafe) {
        applyBlurOverlay(img, cached);
      }
      return;
    }

    img.dataset.nsfwScanned = "true";
    img.dataset.lastScannedUrl = fullUrl;

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "CLASSIFY_IMAGE",
            url: fullUrl,
            threshold: sensitivityThreshold
          },
          (res) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(res || { success: false });
            }
          }
        );
      });

      if (response && response.success && response.result) {
        const result = response.result;
        processedCache.set(fullUrl, result);

        // Update extension statistics
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(["scannedCount", "blurredCount"], (d) => {
            chrome.storage.local.set({
              scannedCount: (d.scannedCount || 0) + 1,
              blurredCount: (d.blurredCount || 0) + (result.isUnsafe ? 1 : 0)
            });
          });
        }

        console.debug(`[NSFW Shield] ${result.topClass.toUpperCase()} (${Math.round(result.confidence * 100)}%)`, fullUrl);

        if (result.isUnsafe) {
          console.warn(`[NSFW Shield] ⚠️ Blurring image: ${result.topClass.toUpperCase()} (${Math.round(result.confidence * 100)}%)`, fullUrl);
          applyBlurOverlay(img, result);
        }
      }
    } catch (err) {
      console.debug("[NSFW Shield] Image classification error:", err);
    }
  }

  // IntersectionObserver to prioritize visible images
  const visibilityObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        processImage(entry.target);
        observer.unobserve(entry.target);
      }
    }
  }, { rootMargin: "300px" });

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

  // MutationObserver to watch for dynamic images and lazy loading src changes
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
        const currentUrl = resolveUrl(img.currentSrc || img.src);
        if (img.dataset.lastScannedUrl !== currentUrl) {
          img.dataset.nsfwScanned = "false";
          observeImage(img);
        }
      }
    }
  });

  function init() {
    document.documentElement.dataset.nsfwShieldActive = "true";
    console.log("[NSFW Shield] Monitoring active on:", window.location.href);

    // Sync settings
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

    // Observe body for dynamic image insertions
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

/**
 * Content Script for Local NSFW Shield
 * - Scans DOM images and dynamically added elements
 * - Resolves image URLs and delegates on-device classification to extension offscreen worker
 * - Applies non-destructive CSS blur with click-to-reveal badge
 */

(function () {
  "use strict";

  if (window.__nsfwShieldLoaded) return;
  window.__nsfwShieldLoaded = true;

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

    // Initialize Pre-Draft Message Vibe Checker
    initVibeChecker();
  }

  /* ========================================================
   * Pre-Draft Message Vibe Checker Module (BlurIt / CYHI)
   * ======================================================== */
  let vibeCheckEnabled = true;
  let activeDraftInput = null;

  const FILLER_SWEAR_WORDS = [
    "mc", "bc", "b.c.", "m.c.", "mkc", "bsdk", "bkl", "bck", "madarchod", 
    "behenchod", "bhenchod", "bhosadike", "bhosdike", "bhosdiwale", "cunt", "fck", "stfu"
  ];

  const ADJECTIVE_SWEAR_WORDS = [
    "chutiya", "chutiye", "ch**iya", "c-tiya", "bakchodi", "saala", "saale", "kutta", "kutte", 
    "harami", "haraami", "kamina", "kaminey", "kamine", "randi", "bhadwa", "bhadwe", "gandu", "gndu", 
    "lodu", "ldu", "laude", "lnd", "lund", "chut", "gaand", "bhosdi", "tatte", "jhaatu", "chod", 
    "chodo", "chodna", "chudai", "chudwa", "gaandmasti", "dalaal", "suar", "suar ki aulad", 
    "namak haram", "haraamzada", "bewakoof", "gadha", "ullu", "ullu ke patthe", "dimaag kharab", 
    "pagal", "dhed shana", "chaprasi", "andhe", "bakwas", "chup kar", "aukaat", "aukat", "nikal", 
    "chal nikal", "bhad me ja", "mar ja", "jahil", "nirlajj", 
    "fuck", "fucking", "fucked", "fucker", "shit", "bitch", "asshole", "ass", "moron", "idiot", 
    "retard", "scumbag", "dickhead", "bastard",
    "kutte ki zat", "कुत्ते की ज़ात", "suar ki zat", "सूअर की ज़ात", "सूअर की औलाद",
    "gadhe ki aulad", "गधे की औलाद", "gadhe ki zat", "गधे की ज़ात", "bandar ki aulad", "बंदर की औलाद", 
    "bandar ki zat", "बंदर की ज़ात", "bhains ki aulad", "भैंस की औलाद", "bhains ki zat", "भैंस की ज़ात", 
    "ullu ki zat", "उल्लू की ज़ात", "lomdi ki aulad", "लोमड़ी की औलाद", 
    "lomdi ki zat", "लोमड़ी की ज़ात", "bhed ki aulad", "भेड़ की औलाद", "bhed ki zat", "भेड़ की ज़ात", 
    "bakri ki aulad", "बकरी की औलाद", "bakri ki zat", "बकरी की ज़ात", "billi ki aulad", "बिल्ली की औलाद", 
    "billi ki zat", "बिल्ली की ज़ात", "mendhak ki aulad", "मेंढक की औलाद", "mendhak ki zat", "मेंढक की ज़ात", 
    "badir", "बदीर", "badirchand", "बदीरचंद", "bakland", "बकलैंड", "बकलंड", "bhandwa", "भंडवा", 
    "भड़वा", "chinaal", "चिनाल", "छनाल", "चूतिया", "चुतिया", "ghasti", "घसटी", "घसति", "ghassad", 
    "घसड़", "घस्सड़", "हरामी", "haram zada", "हरामज़ादा", "हरामजादा", "hijda", "हिजड़ा", "hijra", 
    "tatti", "टट्टी", "चोद", "land", "लंड", "lode", "लोडे", "takke", "टक्के", "chakka", "छक्का", 
    "faggot", "टट्टे", "raand", "रांड", "randhwa", "रंढवा", "jigolo", "जिगोलो", "रंडी", 
    "चूत", "bund", "बंड", "गांडू", "gandi", "गांडी", "bhosdi wala", "भोसड़ी वाला", 
    "bhonsri wala", "भोंसड़ी वाला", "bhosri wala", "भोसरी वाला", "boobley", "बूबले", "chuchi", "चुची", 
    "chuuche", "चूचे", "chuchiyan", "चूचियां", "chut marike", "चूत मार के", "land marike", "लंड मार के", 
    "gand mari ke", "गांड मारी के", "chodu", "चोदू", "lavda", "लौड़ा", "lawda", "लौंडा", "loda", "लोडा", 
    "muth marna", "मुठ मारना", "muthi", "मुठी", "mutthal", "मुठल", "baable", "बाबले", "bur", "बुर", 
    "चोदना", "chudna", "चुदना", "chud", "चुद", "buuble", "भड़वे", "bhadwon", "भड़वों", 
    "bhadwi", "भड़वी", "bhadwapanti", "भड़वापंती", "chodela", "चोदेला", "marana", "मारना", "marani", "मारनी", 
    "marane", "मारने", "gandphatu", "गांडफटू", "gandphati", "गांडफटी", "gandphata", "गांडफटा", "gandphaton", 
    "गांडफटों", "गांडमस्ती", "gand marna", "गांड मारना", "gand maru", "गांड मारू", "gand mari", 
    "गांड मारी", "gand marana", "गांड माराना", "jhaant", "झाँट", "gand phatu", "गांड फटू", "gand phati", "गांड फटी", 
    "gand phata", "गांड फटा", "gand phaton", "गांड फटों", "gaand masti", "गांड मस्ती", "gandmarna", "गांडमरना", 
    "gandmaru", "गांडमरू", "gandmarana", "गांडमराना", "gandmari", "गांडमारी", "randibazar", "रंडीबाज़ार", 
    "chodo", "चोदो", "chodi", "चोदी", "chodne", "चोदने", "chodva", "चोदवा", "chudo", "चुदो", "chudi", "चुदी", 
    "chudne", "चुदने", "chudva", "चुदवा", "chodai", "चोदाई", "chuda", "चुदा", "chudai", "चुदाई", "chudvana", 
    "चुदवाना", "haramia", "हरामिया", "haramzada", "haramzadi", "हरामज़ादी", "haramkhor", "हरामख़ोर", "kamini", 
    "कमीनी", "bhosdi", "भोसड़ी", "bhosdike", "भोसड़ीके", "bhandi", "भंडी", "rand", "randwa", 
    "रांडवा", "randibazaar", "रांडिबाजार", "hijade", "हिजड़े", "gandu", "गंडू", "लवड़ा", "lundwa", "लंडवा", 
    "chutmar", "चूतमार", "chutiyapa", "चूतियापा"
  ];

  const EUPHEMISTIC_THREATS = [
    "send you to heaven", "hunt you down", "will end you", "dig a grave", "put you in a body bag",
    "sleep with the fishes", "put you in the ground", "send you to god", "meet your maker", 
    "know where you live", "i will kill you", "slit your throat", "watch your back", "die in a fire"
  ];

  const LEET_MAP = {
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", "$": "s", "!": "i"
  };

  const REPHRASE_DICTIONARY = {
    "idiot": "misguided person",
    "idiots": "those who disagree",
    "moron": "misinformed person",
    "morons": "misinformed people",
    "stupid": "unhelpful",
    "hate": "strongly disagree with",
    "shut up": "let's pause for a moment",
    "chup kar": "let's pause for a moment",
    "fuck off": "please give me space",
    "fuck you": "I strongly disagree with you",
    "fucking": "extremely",
    "shit": "subpar",
    "crap": "low quality",
    "asshole": "unreasonable person",
    "chutiya": "confused person",
    "chutiye": "confused person",
    "saala": "friend",
    "saale": "friend",
    "gandu": "fellow",
    "bitch": "person",
    "bastard": "individual",
    "bewakoof": "uninformed person",
    "gadha": "stubborn one",
    "ullu": "friend",
    "bakwas": "unhelpful discussion",
    "nikal": "please leave",
    "chal nikal": "let's move on",
    "suar": "unpleasant individual",
    "pagal": "excited",
    "aukaat": "capability",
    "aukat": "capability",
    "bhosdi wala": "friend",
    "bhosdike": "friend",
    "kaminey": "friend",
    "kamine": "friend",
    "चूतिया": "confused person",
    "हरामी": "mischievous person"
  };

  function normalizeLeetspeak(text) {
    if (!text) return "";
    let normalized = "";
    for (const char of text) {
      normalized += LEET_MAP[char] || char;
    }
    normalized = normalized
      .replace(/f[\*_\-\.]+(u?)c?k/gi, "fuck")
      .replace(/f[\*_\-\.]+(u?)c?king/gi, "fucking")
      .replace(/sh[\*_\-\.]+(i?)t/gi, "shit")
      .replace(/s[\*_\-\.]+(h?)i?t/gi, "shit")
      .replace(/b[\*_\-\.]+(i?)t?ch/gi, "bitch")
      .replace(/a[\*_\-\.]+(s?)hole/gi, "asshole")
      .replace(/b[\*_\-\.]+sdk/gi, "bsdk")
      .replace(/m[\*_\-\.]+c/gi, "mc")
      .replace(/b[\*_\-\.]+c/gi, "bc");
    return normalized;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildCompiledWord(word, isFiller = false) {
    const isDev = /[\u0900-\u097F]/.test(word);
    const escaped = escapeRegex(word);
    let testRegex, replaceRegex;
    if (isDev) {
      testRegex = new RegExp("(?<=^|[^\\p{L}\\p{N}])" + escaped + "(?=$|[^\\p{L}\\p{N}])", "ui");
      replaceRegex = new RegExp("(?<=^|[^\\p{L}\\p{N}])" + escaped + "(?=$|[^\\p{L}\\p{N}])", "gui");
    } else {
      const prefix = /^\w/.test(word) ? "\\b" : "(?<=^|\\s)";
      const suffix = /\w$/.test(word) ? "\\b" : "(?=$|\\s)";
      testRegex = new RegExp(prefix + escaped + suffix, "i");
      replaceRegex = new RegExp(prefix + escaped + suffix, "gi");
    }
    return { word, isFiller, testRegex, replaceRegex };
  }

  // Precompile word patterns once for sub-millisecond evaluation speed
  const COMPILED_SWEARS = [
    ...FILLER_SWEAR_WORDS.map(w => buildCompiledWord(w, true)),
    ...ADJECTIVE_SWEAR_WORDS.map(w => buildCompiledWord(w, false))
  ].sort((a, b) => b.word.length - a.word.length);

  function clientSideVibeAnalysis(rawText) {
    const normalized = normalizeLeetspeak(rawText);
    const lower = normalized.toLowerCase();

    let toxicReason = null;
    let isToxic = false;
    let flaggedWords = [];

    // 1. Check euphemistic threats
    for (const threat of EUPHEMISTIC_THREATS) {
      if (lower.includes(threat)) {
        isToxic = true;
        toxicReason = "Threat pattern detected";
        flaggedWords.push(threat);
        break;
      }
    }

    // 2. High-performance check across compiled Hinglish, English, and Devanagari words
    if (!isToxic) {
      for (const item of COMPILED_SWEARS) {
        if (item.testRegex.test(normalized)) {
          isToxic = true;
          toxicReason = item.isFiller ? "Profanity detected" : "Abusive / insulting language";
          if (!flaggedWords.includes(item.word)) flaggedWords.push(item.word);
        }
      }
    }

    if (!isToxic) {
      return { isToxic: false, reason: "safe", suggestion: rawText };
    }

    // Generate deterministic polite suggestion starting from normalized text
    let suggestion = normalizeLeetspeak(rawText);

    // Neutralize euphemistic threats
    for (const threat of EUPHEMISTIC_THREATS) {
      const reg = new RegExp(escapeRegex(threat), "gi");
      suggestion = suggestion.replace(reg, "resolve our disagreement calmly");
    }

    // Apply polite dictionary replacements and asterisks in length-descending order
    for (const item of COMPILED_SWEARS) {
      if (item.testRegex.test(suggestion)) {
        const replacement = item.isFiller
          ? ""
          : (REPHRASE_DICTIONARY[item.word.toLowerCase()] || REPHRASE_DICTIONARY[item.word] || "***");
        suggestion = suggestion.replace(item.replaceRegex, replacement);
      }
    }

    // Clean up spacing and orphaned commas
    suggestion = suggestion
      .replace(/\s*,\s*,+/g, ",")
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s{2,}/g, " ")
      .trim();

    // If completely censored or empty, provide a constructive template
    if (!suggestion || suggestion === "***" || suggestion.length < 3) {
      suggestion = "I would like to offer constructive feedback on this.";
    }

    return {
      isToxic: true,
      reason: toxicReason,
      flagged: flaggedWords,
      suggestion: suggestion
    };
  }

  async function analyzeDraftVibe(text) {
    // 1. Try background worker bridge to local FastAPI server (bypasses page CSP)
    if (chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const bgRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "CHECK_VIBE_BACKEND", text }, (response) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(response);
            }
          });
        });

        if (bgRes && bgRes.success && bgRes.data) {
          const data = bgRes.data;
          if (data.status === "toxic") {
            return {
              isToxic: true,
              reason: data.reason || "Toxicity detected by AI",
              suggestion: data.rephrase_suggestion || text
            };
          } else {
            return { isToxic: false, reason: "safe", suggestion: text };
          }
        }
      } catch {
        // Continue to fallback
      }
    }

    // 2. Direct local fetch attempt if standalone
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      const res = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.status === "toxic") {
          return {
            isToxic: true,
            reason: data.reason || "Toxicity detected by AI",
            suggestion: data.rephrase_suggestion || text
          };
        } else {
          return { isToxic: false, reason: "safe", suggestion: text };
        }
      }
    } catch {
      // Server not reachable — seamlessly use on-device engine
    }

    // 3. On-device deterministic analyzer fallback
    return clientSideVibeAnalysis(text);
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "blur-it-toast";
    toast.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      setTimeout(() => toast.remove(), 350);
    }, 2800);
  }

  function initVibeChecker() {
    // Check if elements already injected
    if (document.getElementById("blur-it-vibe-btn")) return;

    // 1. Create floating Vibe Check pill
    const vibeBtn = document.createElement("button");
    vibeBtn.id = "blur-it-vibe-btn";
    vibeBtn.type = "button";
    vibeBtn.setAttribute("aria-label", "Check draft vibe and toxicity");
    vibeBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path>
      </svg>
      <span id="blur-it-vibe-btn-text">Vibe Check</span>
    `;
    document.body.appendChild(vibeBtn);

    // 2. Create Suggestion Tooltip
    const tooltip = document.createElement("div");
    tooltip.id = "blur-it-vibe-tooltip";
    tooltip.innerHTML = `
      <div class="blur-it-vibe-header">
        <div class="blur-it-vibe-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>Toxicity Detected</span>
        </div>
        <span class="blur-it-vibe-badge" id="blur-it-vibe-reason">Abusive</span>
      </div>
      <div class="blur-it-vibe-body">
        This draft may come across as toxic or inflammatory. Consider this constructive alternative:
        <div class="blur-it-vibe-suggestion" id="blur-it-suggestion-text"></div>
      </div>
      <div class="blur-it-vibe-actions">
        <button type="button" class="blur-it-btn-accept" id="blur-it-btn-replace">Replace Text</button>
        <button type="button" class="blur-it-btn-ignore" id="blur-it-btn-dismiss">Ignore</button>
      </div>
    `;
    document.body.appendChild(tooltip);

    // Track active inputs
    document.addEventListener("focusin", (e) => {
      const target = e.target;
      if (!target) return;
      const isInput = target.tagName === "TEXTAREA" ||
                      (target.tagName === "INPUT" && ["text", "search", ""].includes(target.type)) ||
                      target.isContentEditable;
      if (isInput) {
        activeDraftInput = target;
        vibeBtn.classList.remove("blur-it-hidden");
      }
    }, true);

    // Sync settings for vibe check / text filter
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(["vibeCheckEnabled", "textFilterEnabled"], (data) => {
        const isVibe = data.textFilterEnabled !== undefined
          ? data.textFilterEnabled
          : (data.vibeCheckEnabled !== undefined ? data.vibeCheckEnabled : true);
        vibeCheckEnabled = isVibe;
        if (!vibeCheckEnabled) vibeBtn.classList.add("blur-it-hidden");
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && (changes.vibeCheckEnabled || changes.textFilterEnabled)) {
          const newVal = changes.textFilterEnabled ? changes.textFilterEnabled.newValue : changes.vibeCheckEnabled.newValue;
          vibeCheckEnabled = newVal;
          if (vibeCheckEnabled) {
            vibeBtn.classList.remove("blur-it-hidden");
          } else {
            vibeBtn.classList.add("blur-it-hidden");
            tooltip.style.display = "none";
          }
        }
      });
    }

    // Position & Show Tooltip
    function showVibeTooltip(result, targetElement) {
      const reasonEl = document.getElementById("blur-it-vibe-reason");
      const suggestionEl = document.getElementById("blur-it-suggestion-text");

      reasonEl.textContent = result.reason || "Toxic Tone";
      suggestionEl.textContent = `"${result.suggestion}"`;

      tooltip.style.display = "block";

      const rect = targetElement.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      // Above or below target
      if (rect.bottom + tooltipRect.height + 15 < window.innerHeight) {
        tooltip.style.top = (window.scrollY + rect.bottom + 8) + "px";
      } else {
        tooltip.style.top = Math.max(10, window.scrollY + rect.top - tooltipRect.height - 8) + "px";
      }

      // Horizontal clamp
      let left = window.scrollX + rect.left;
      if (left + tooltipRect.width > window.innerWidth - 20) {
        left = window.innerWidth - tooltipRect.width - 20;
      }
      tooltip.style.left = Math.max(10, left) + "px";

      // Multi-framework bulletproof text replacement
      function applyTextReplacement(target, newText) {
        if (!target) return false;

        // 1. Contenteditable elements (WhatsApp Web, Twitter/X, Discord, Slack, Lexical, Draft.js)
        const contentEditableRoot = target.isContentEditable 
          ? (target.closest ? (target.closest('[contenteditable="true"]') || target) : target)
          : (target.closest ? target.closest('[contenteditable="true"]') : null);

        if (contentEditableRoot) {
          contentEditableRoot.focus();
          let replaced = false;
          try {
            const range = document.createRange();
            range.selectNodeContents(contentEditableRoot);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            replaced = document.execCommand("insertText", false, newText);
          } catch (e) {
            console.debug("execCommand CE error:", e);
          }

          if (!replaced || (contentEditableRoot.innerText.trim() !== newText.trim())) {
            contentEditableRoot.innerText = newText;
            contentEditableRoot.textContent = newText;
          }

          try {
            contentEditableRoot.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertReplacementText", data: newText }));
          } catch {
            contentEditableRoot.dispatchEvent(new Event("input", { bubbles: true }));
          }
          contentEditableRoot.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }

        // 2. Standard Input & Textarea (supports React 16+, Vue, Angular controlled inputs)
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || "value" in target) {
          target.focus();
          let replaced = false;

          try {
            if (target.select) target.select();
            if (target.setSelectionRange) target.setSelectionRange(0, target.value.length);
            replaced = document.execCommand("insertText", false, newText);
          } catch (e) {
            console.debug("execCommand input error:", e);
          }

          // React native prototype setter fallback
          try {
            const proto = target.tagName === "TEXTAREA" 
              ? window.HTMLTextAreaElement.prototype 
              : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
            if (setter) {
              setter.call(target, newText);
            } else {
              target.value = newText;
            }
          } catch {
            target.value = newText;
          }

          try {
            target.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertReplacementText", data: newText }));
          } catch {
            target.dispatchEvent(new Event("input", { bubbles: true }));
          }
          target.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }

        // 3. Fallback
        target.innerText = newText;
        target.textContent = newText;
        return true;
      }

      // Replace button handler
      const replaceBtn = document.getElementById("blur-it-btn-replace");
      replaceBtn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const replacement = result.suggestion;
        applyTextReplacement(targetElement, replacement);

        tooltip.style.display = "none";
        showToast("✨ Text safely replaced with constructive version!");

        // Update stats
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(["vibeCheckedCount", "vibeReplacedCount"], (d) => {
            chrome.storage.local.set({
              vibeCheckedCount: (d.vibeCheckedCount || 0) + 1,
              vibeReplacedCount: (d.vibeReplacedCount || 0) + 1
            });
          });
        }
      };

      // Ignore button handler
      document.getElementById("blur-it-btn-dismiss").onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        tooltip.style.display = "none";
      };
    }

    // Button click handler
    vibeBtn.addEventListener("click", async () => {
      if (!vibeCheckEnabled) return;

      if (!activeDraftInput || !document.body.contains(activeDraftInput)) {
        showToast("ℹ️ Click inside any text box first to check vibe!");
        return;
      }

      const text = activeDraftInput.isContentEditable
        ? activeDraftInput.innerText
        : activeDraftInput.value;

      if (!text || text.trim().length === 0) {
        showToast("ℹ️ The text box is empty!");
        return;
      }

      const btnText = document.getElementById("blur-it-vibe-btn-text");
      vibeBtn.classList.add("blur-it-checking");
      btnText.textContent = "Checking...";

      try {
        const result = await analyzeDraftVibe(text);

        // Update checked count
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(["vibeCheckedCount"], (d) => {
            chrome.storage.local.set({
              vibeCheckedCount: (d.vibeCheckedCount || 0) + 1
            });
          });
        }

        if (result.isToxic) {
          showVibeTooltip(result, activeDraftInput);
        } else {
          tooltip.style.display = "none";
          showToast("✅ Passed Vibe Check! Message is constructive & safe.");
        }
      } catch (err) {
        showToast("⚠️ Vibe Check could not complete.");
      } finally {
        vibeBtn.classList.remove("blur-it-checking");
        btnText.textContent = "Vibe Check";
      }
    });

    // Close tooltip on external click or Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") tooltip.style.display = "none";
    });
    document.addEventListener("pointerdown", (e) => {
      if (!tooltip.contains(e.target) && e.target !== vibeBtn && !vibeBtn.contains(e.target)) {
        tooltip.style.display = "none";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

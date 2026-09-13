/**
 * BlurIt - Modern Professional Popup Controller
 * Manages protection state, sensitivity presets, slider sync, and live stats.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("enable-toggle");
  const vibeToggle = document.getElementById("vibe-toggle");
  const statusBadge = document.getElementById("status-badge");
  const statusText = document.getElementById("status-text");
  const shieldSubtext = document.getElementById("shield-subtext");
  const vibeSubtext = document.getElementById("vibe-subtext");
  const slider = document.getElementById("threshold-slider");
  const thresholdVal = document.getElementById("threshold-val");
  const presetBtns = document.querySelectorAll(".preset-btn");
  const statBlurred = document.getElementById("stat-blurred");
  const statScanned = document.getElementById("stat-scanned");
  const statVibe = document.getElementById("stat-vibe");

  function getThresholdLabel(val) {
    const num = parseFloat(val);
    if (num <= 0.22) return `Strict (${Math.round(num * 100)}%)`;
    if (num <= 0.38) return `Standard (${Math.round(num * 100)}%)`;
    return `Relaxed (${Math.round(num * 100)}%)`;
  }

  function updatePresetButtons(val) {
    const num = parseFloat(val);
    presetBtns.forEach((btn) => {
      const btnVal = parseFloat(btn.dataset.val);
      if (Math.abs(btnVal - num) < 0.05) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  function updateStatusDisplay(enabled) {
    if (enabled) {
      statusBadge.classList.remove("paused");
      statusText.textContent = "Active";
      shieldSubtext.textContent = "Images scanned & blurred locally";
    } else {
      statusBadge.classList.add("paused");
      statusText.textContent = "Paused";
      shieldSubtext.textContent = "Visual protection paused across tabs";
    }
  }

  // 1. Load saved settings from chrome.storage.sync
  if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(["enabled", "threshold", "vibeCheckEnabled", "hfToken"], (data) => {
      const enabled = data.enabled !== undefined ? data.enabled : true;
      const vibeEnabled = data.vibeCheckEnabled !== undefined ? data.vibeCheckEnabled : true;
      const threshold = data.threshold !== undefined ? parseFloat(data.threshold) : 0.30;

      if (toggle) toggle.checked = enabled;
      if (vibeToggle) vibeToggle.checked = vibeEnabled;
      if (slider) slider.value = threshold;
      if (thresholdVal) thresholdVal.textContent = getThresholdLabel(threshold);
      updatePresetButtons(threshold);
      updateStatusDisplay(enabled);

      const hfInput = document.getElementById("popup-hf-token");
      if (hfInput && data.hfToken) {
        hfInput.value = data.hfToken;
      }
    });
  }

  // 2. Load live metrics from chrome.storage.local
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["blurredCount", "scannedCount", "vibeCheckedCount"], (data) => {
      if (statBlurred) statBlurred.textContent = (data.blurredCount || 0).toLocaleString();
      if (statScanned) statScanned.textContent = (data.scannedCount || 0).toLocaleString();
      if (statVibe) statVibe.textContent = (data.vibeCheckedCount || 0).toLocaleString();
    });

    // Listen for real-time stats updates while popup is open
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        if (changes.blurredCount && statBlurred) {
          statBlurred.textContent = (changes.blurredCount.newValue || 0).toLocaleString();
        }
        if (changes.scannedCount && statScanned) {
          statScanned.textContent = (changes.scannedCount.newValue || 0).toLocaleString();
        }
        if (changes.vibeCheckedCount && statVibe) {
          statVibe.textContent = (changes.vibeCheckedCount.newValue || 0).toLocaleString();
        }
      }
    });
  }

  // 3. Toggle protection handlers
  if (toggle) {
    toggle.addEventListener("change", () => {
      const isEnabled = toggle.checked;
      updateStatusDisplay(isEnabled);
      if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set({ enabled: isEnabled });
      }
    });
  }

  if (vibeToggle) {
    vibeToggle.addEventListener("change", () => {
      const isVibeEnabled = vibeToggle.checked;
      if (vibeSubtext) {
        vibeSubtext.textContent = isVibeEnabled
          ? "Pre-draft toxicity detection & rephrase"
          : "Text filter paused across all tabs";
      }
      const quickSection = document.getElementById("quick-text-section");
      if (quickSection) {
        quickSection.style.opacity = isVibeEnabled ? "1" : "0.5";
        quickSection.style.pointerEvents = isVibeEnabled ? "auto" : "none";
      }
      if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set({
          vibeCheckEnabled: isVibeEnabled,
          textFilterEnabled: isVibeEnabled
        });
      }
    });
  }

  // 4. In-Popup Quick Text Checker
  const popupTextInput = document.getElementById("popup-text-input");
  const popupCheckBtn = document.getElementById("popup-check-btn");
  const popupTextResult = document.getElementById("popup-text-result");
  const popupResultBadge = document.getElementById("popup-result-badge");
  const popupResultReason = document.getElementById("popup-result-reason");
  const popupResultSuggestion = document.getElementById("popup-result-suggestion");

  const FILLER_SWEARS = [
    "mc", "bc", "b.c.", "m.c.", "mkc", "bsdk", "bkl", "bck", "madarchod", 
    "behenchod", "bhenchod", "bhosadike", "bhosdike", "bhosdiwale", "cunt", "fck", "stfu"
  ];
  const ADJ_SWEARS = [
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
  const THREATS = [
    "send you to heaven", "hunt you down", "will end you", "dig a grave", "put you in a body bag",
    "sleep with the fishes", "put you in the ground", "send you to god", "meet your maker", 
    "know where you live", "i will kill you", "slit your throat", "watch your back", "die in a fire"
  ];
  const REPHRASE_MAP = {
    "idiot": "misguided person", "idiots": "those who disagree",
    "moron": "misinformed person", "morons": "misinformed people",
    "stupid": "unhelpful", "hate": "disagree with",
    "shut up": "let's pause for a moment", "chup kar": "let's pause for a moment",
    "fuck off": "please give me space", "fuck you": "I disagree with you", "fucking": "extremely",
    "shit": "subpar", "crap": "low quality", "asshole": "unreasonable person",
    "chutiya": "confused person", "chutiye": "confused person", "saala": "friend", "saale": "friend", 
    "gandu": "fellow", "bewakoof": "uninformed person", "gadha": "stubborn one", "ullu": "friend",
    "bakwas": "unhelpful discussion", "nikal": "please leave", "chal nikal": "let's move on",
    "suar": "unpleasant individual", "pagal": "excited", "aukaat": "capability", "aukat": "capability",
    "bhosdi wala": "friend", "bhosdike": "friend", "kaminey": "friend", "kamine": "friend",
    "चूतिया": "confused person", "हरामी": "mischievous person"
  };

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

  const COMPILED_SWEARS = [
    ...FILLER_SWEARS.map(w => buildCompiledWord(w, true)),
    ...ADJ_SWEARS.map(w => buildCompiledWord(w, false))
  ].sort((a, b) => b.word.length - a.word.length);

  function clientDetox(text) {
    let normalized = text
      .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/@/g, "a").replace(/\$/g, "s")
      .replace(/f[\*_\-\.]+(u?)c?k/gi, "fuck")
      .replace(/sh[\*_\-\.]+(i?)t/gi, "shit")
      .replace(/b[\*_\-\.]+(i?)t?ch/gi, "bitch")
      .replace(/b[\*_\-\.]+sdk/gi, "bsdk");

    const lower = normalized.toLowerCase();
    let isToxic = false;
    let reason = "Safe";

    for (const t of THREATS) {
      if (lower.includes(t)) {
        isToxic = true;
        reason = "Threat pattern";
        break;
      }
    }

    if (!isToxic) {
      for (const item of COMPILED_SWEARS) {
        if (item.testRegex.test(normalized)) {
          isToxic = true;
          reason = item.isFiller ? "Profanity" : "Abusive language";
          break;
        }
      }
    }

    if (!isToxic) {
      return { isToxic: false, reason: "Constructive & Safe", suggestion: text };
    }

    let suggestion = normalized;
    for (const t of THREATS) {
      suggestion = suggestion.replace(new RegExp(escapeRegex(t), "gi"), "resolve our disagreement calmly");
    }
    for (const item of COMPILED_SWEARS) {
      if (item.testRegex.test(suggestion)) {
        const replacement = item.isFiller
          ? ""
          : (REPHRASE_MAP[item.word.toLowerCase()] || REPHRASE_MAP[item.word] || "***");
        suggestion = suggestion.replace(item.replaceRegex, replacement);
      }
    }
    suggestion = suggestion.replace(/\s*,\s*,+/g, ",").replace(/\s*,\s*/g, ", ").replace(/\s{2,}/g, " ").trim();

    return { isToxic: true, reason: reason, suggestion: suggestion || "I offer constructive feedback on this." };
  }

  async function handlePopupCheck() {
    const text = (popupTextInput ? popupTextInput.value : "").trim();
    if (!text) return;

    if (popupCheckBtn) popupCheckBtn.textContent = "...";

    let result = null;

    // Check backend first
    if (chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const res = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "CHECK_VIBE_BACKEND", text }, (r) => {
            resolve(chrome.runtime.lastError ? null : r);
          });
        });
        if (res && res.success && res.data) {
          result = {
            isToxic: res.data.status === "toxic",
            reason: res.data.reason || "AI Model",
            suggestion: res.data.rephrase_suggestion || text
          };
        }
      } catch {
        // fallback
      }
    }

    if (!result) {
      result = clientDetox(text);
    }

    if (popupCheckBtn) popupCheckBtn.textContent = "Check";
    if (popupTextResult) popupTextResult.style.display = "block";

    if (popupResultBadge) {
      popupResultBadge.textContent = result.isToxic ? "Toxic" : "Safe";
      popupResultBadge.className = "result-badge " + (result.isToxic ? "toxic" : "safe");
    }

    if (popupResultReason) {
      popupResultReason.textContent = result.reason;
    }

    let lastSuggestion = result.suggestion;
    const popupResultActions = document.getElementById("popup-result-actions");
    const popupReplaceBtn = document.getElementById("popup-replace-btn");
    const popupCopyBtn = document.getElementById("popup-copy-btn");

    if (popupResultSuggestion) {
      popupResultSuggestion.textContent = result.isToxic
        ? `Suggestion: "${result.suggestion}"`
        : "Message is safe to publish.";
    }

    if (popupResultActions) {
      popupResultActions.style.display = result.isToxic ? "flex" : "none";
    }

    if (popupReplaceBtn) {
      popupReplaceBtn.onclick = () => {
        if (popupTextInput && lastSuggestion) {
          popupTextInput.value = lastSuggestion;
          popupResultSuggestion.textContent = "✅ Text updated in input box!";
          popupResultActions.style.display = "none";
        }
      };
    }

    if (popupCopyBtn) {
      popupCopyBtn.onclick = () => {
        if (lastSuggestion) {
          navigator.clipboard.writeText(lastSuggestion);
          popupCopyBtn.textContent = "Copied!";
          setTimeout(() => popupCopyBtn.textContent = "Copy", 1500);
        }
      };
    }

    // Update stats
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["vibeCheckedCount"], (d) => {
        chrome.storage.local.set({ vibeCheckedCount: (d.vibeCheckedCount || 0) + 1 });
      });
    }
  }

  if (popupCheckBtn) {
    popupCheckBtn.addEventListener("click", handlePopupCheck);
  }
  if (popupTextInput) {
    popupTextInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handlePopupCheck();
    });
  }

  // 5. Slider change handler
  if (slider) {
    slider.addEventListener("input", () => {
      const val = parseFloat(slider.value);
      if (thresholdVal) thresholdVal.textContent = getThresholdLabel(val);
      updatePresetButtons(val);
      if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set({ threshold: val });
      }
    });
  }

  // 6. Preset button clicks
  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = parseFloat(btn.dataset.val);
      if (slider) slider.value = val;
      if (thresholdVal) thresholdVal.textContent = getThresholdLabel(val);
      updatePresetButtons(val);
      if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set({ threshold: val });
      }
    });
  });

  // 7. Save HF Token
  const saveHfBtn = document.getElementById("popup-save-hf-btn");
  if (saveHfBtn) {
    saveHfBtn.addEventListener("click", () => {
      const hfInput = document.getElementById("popup-hf-token");
      const token = hfInput ? hfInput.value.trim() : "";
      if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set({ hfToken: token }, () => {
          saveHfBtn.textContent = "Saved!";
          setTimeout(() => saveHfBtn.textContent = "Save", 1500);
        });
      }
    });
  }
});

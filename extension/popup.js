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
    chrome.storage.sync.get(["enabled", "threshold", "vibeCheckEnabled"], (data) => {
      const enabled = data.enabled !== undefined ? data.enabled : true;
      const vibeEnabled = data.vibeCheckEnabled !== undefined ? data.vibeCheckEnabled : true;
      const threshold = data.threshold !== undefined ? parseFloat(data.threshold) : 0.30;

      if (toggle) toggle.checked = enabled;
      if (vibeToggle) vibeToggle.checked = vibeEnabled;
      if (slider) slider.value = threshold;
      if (thresholdVal) thresholdVal.textContent = getThresholdLabel(threshold);
      updatePresetButtons(threshold);
      updateStatusDisplay(enabled);
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

  const FILLER_SWEARS = ["mc", "bc", "mkc", "bsdk", "bhosdike", "madarchod", "behenchod", "bkl", "cunt", "stfu"];
  const ADJ_SWEARS = [
    "chutiya", "saala", "kutta", "harami", "kamina", "randi", "bhadwa", "gandu",
    "lodu", "lnd", "lund", "chut", "gaand", "bhosdi", "tatte", "fuck", "fucking",
    "fucked", "shit", "bitch", "asshole", "ass", "moron", "idiot", "retard", "bastard"
  ];
  const THREATS = [
    "send you to heaven", "sleep with the fishes", "put you in the ground",
    "send you to god", "meet your maker", "hunt you down", "know where you live",
    "i will kill you", "slit your throat", "die in a fire"
  ];
  const REPHRASE_MAP = {
    "idiot": "misguided person", "idiots": "those who disagree",
    "moron": "misinformed person", "morons": "misinformed people",
    "stupid": "unhelpful", "hate": "disagree with",
    "shut up": "let's pause for a moment", "fuck off": "please give me space",
    "fuck you": "I disagree with you", "fucking": "extremely",
    "shit": "subpar", "crap": "low quality", "asshole": "unreasonable person",
    "chutiya": "confused person", "saala": "friend", "gandu": "fellow"
  };

  function clientDetox(text) {
    let normalized = text
      .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/@/g, "a").replace(/\$/g, "s")
      .replace(/f[\*_\-\.]+(u?)c?k/gi, "fuck")
      .replace(/sh[\*_\-\.]+(i?)t/gi, "shit")
      .replace(/b[\*_\-\.]+(i?)t?ch/gi, "bitch")
      .replace(/b[\*_\-\.]+sdk/gi, "bsdk");

    const lower = normalized.toLowerCase();
    const words = lower.replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);

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
      for (const w of words) {
        if (FILLER_SWEARS.includes(w)) {
          isToxic = true;
          reason = "Profanity";
          break;
        } else if (ADJ_SWEARS.includes(w) || REPHRASE_MAP.hasOwnProperty(w)) {
          isToxic = true;
          reason = "Abusive term";
          break;
        }
      }
    }

    if (!isToxic) {
      return { isToxic: false, reason: "Constructive & Safe", suggestion: text };
    }

    let suggestion = normalized;
    for (const t of THREATS) {
      suggestion = suggestion.replace(new RegExp(t, "gi"), "resolve our disagreement calmly");
    }
    for (const f of FILLER_SWEARS) {
      suggestion = suggestion.replace(new RegExp("\\b" + f + "\\b", "gi"), "");
    }
    for (const [bad, polite] of Object.entries(REPHRASE_MAP)) {
      suggestion = suggestion.replace(new RegExp("\\b" + bad + "\\b", "gi"), polite);
    }
    for (const s of ADJ_SWEARS) {
      suggestion = suggestion.replace(new RegExp("\\b" + s + "\\b", "gi"), "***");
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

    if (popupResultSuggestion) {
      popupResultSuggestion.textContent = result.isToxic
        ? `Suggestion: "${result.suggestion}"`
        : "Message is safe to publish.";
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
});

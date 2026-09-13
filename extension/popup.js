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
          ? "Pre-post toxicity & polite detox"
          : "Message vibe check paused";
      }
      if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set({ vibeCheckEnabled: isVibeEnabled });
      }
    });
  }

  // 4. Slider change handler
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

  // 5. Preset button clicks
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

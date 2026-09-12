/**
 * Popup Logic for Local NSFW Shield
 * Controls toggling and sensitivity threshold synchronization with chrome.storage.sync.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("enable-toggle");
  const statusText = document.getElementById("status-text");
  const slider = document.getElementById("threshold-slider");
  const thresholdVal = document.getElementById("threshold-val");

  // Load saved settings
  if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(["enabled", "threshold"], (data) => {
      const enabled = data.enabled !== undefined ? data.enabled : true;
      const threshold = data.threshold !== undefined ? data.threshold : 0.30;

      toggle.checked = enabled;
      slider.value = threshold;
      thresholdVal.textContent = parseFloat(threshold).toFixed(2);
      updateStatusDisplay(enabled);
    });
  }

  function updateStatusDisplay(enabled) {
    if (enabled) {
      statusText.textContent = "Protection Active";
      statusText.style.color = "#34d399";
    } else {
      statusText.textContent = "Shield Paused";
      statusText.style.color = "#94a3b8";
    }
  }

  // Toggle handler
  toggle.addEventListener("change", () => {
    const isEnabled = toggle.checked;
    updateStatusDisplay(isEnabled);
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ enabled: isEnabled });
    }
  });

  // Slider handler
  slider.addEventListener("input", () => {
    const val = parseFloat(slider.value);
    thresholdVal.textContent = val.toFixed(2);
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ threshold: val });
    }
  });
});

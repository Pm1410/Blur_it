/**
 * AI/M.I. (CYHI) — Popup Controller v1.0
 */

document.addEventListener("DOMContentLoaded", async () => {
  /* ── DOM Elements ── */
  const toggleToxicity = document.getElementById("toggle-toxicity");
  const toggleNsfw = document.getElementById("toggle-nsfw");
  const toggleSemantic = document.getElementById("toggle-semantic");
  const toggleVibe = document.getElementById("toggle-vibe");

  const statScanned = document.getElementById("stat-scanned");
  const statToxic = document.getElementById("stat-toxic");
  const statNsfw = document.getElementById("stat-nsfw");
  const statSemantic = document.getElementById("stat-semantic");
  const statAvgTox = document.getElementById("stat-avgtox");
  const statReplaced = document.getElementById("stat-replaced");
  const resetStatsBtn = document.getElementById("reset-stats-btn");

  const toxSlider = document.getElementById("tox-slider");
  const toxLabel = document.getElementById("tox-threshold-label");
  const presets = document.querySelectorAll(".preset[data-tox]");

  const topicsLabel = document.getElementById("topics-label");
  const topicsSection = document.getElementById("topics-section");
  const topicInput = document.getElementById("topic-input");
  const addTopicBtn = document.getElementById("add-topic-btn");
  const topicsList = document.getElementById("topics-list");
  const semSlider = document.getElementById("sem-slider");
  const semLabel = document.getElementById("sem-threshold-label");

  const openDemoBtn = document.getElementById("open-demo-btn");

  /* ── Default Config ── */
  const defaultCfg = {
    toxicityEnabled: true,
    nsfwEnabled: true,
    semanticEnabled: false,
    vibeCheckEnabled: true,
    toxicityThreshold: 0.55,
    semanticThreshold: 0.60,
    semanticTopics: ["politics", "hate speech", "crypto scams"],
    nsfwThreshold: 0.30
  };

  let cfg = { ...defaultCfg };

  /* ── Load Stored Settings & Stats ── */
  async function loadData() {
    if (chrome.storage?.sync) {
      const syncData = await chrome.storage.sync.get(["aimiConfig"]);
      if (syncData.aimiConfig) {
        cfg = { ...defaultCfg, ...syncData.aimiConfig };
      }
    }

    // Apply UI state from config
    if (toggleToxicity) toggleToxicity.checked = !!cfg.toxicityEnabled;
    if (toggleNsfw) toggleNsfw.checked = !!cfg.nsfwEnabled;
    if (toggleSemantic) toggleSemantic.checked = !!cfg.semanticEnabled;
    if (toggleVibe) toggleVibe.checked = !!cfg.vibeCheckEnabled;

    if (toxSlider) {
      toxSlider.value = cfg.toxicityThreshold;
      toxLabel.textContent = `${Math.round(cfg.toxicityThreshold * 100)}%`;
      updatePresetButtons(cfg.toxicityThreshold);
    }

    if (semSlider) {
      semSlider.value = cfg.semanticThreshold;
      semLabel.textContent = `${Math.round(cfg.semanticThreshold * 100)}%`;
    }

    updateTopicsVisibility();
    renderTopics();
    updateStatsDisplay();
  }

  function saveConfig() {
    if (chrome.storage?.sync) {
      chrome.storage.sync.set({ aimiConfig: cfg });
    }
  }

  function updatePresetButtons(val) {
    presets.forEach(p => {
      const pVal = parseFloat(p.getAttribute("data-tox"));
      if (Math.abs(pVal - val) < 0.03) {
        p.classList.add("active");
      } else {
        p.classList.remove("active");
      }
    });
  }

  function updateTopicsVisibility() {
    const isVisible = !!cfg.semanticEnabled;
    if (topicsLabel) topicsLabel.style.display = isVisible ? "block" : "none";
    if (topicsSection) topicsSection.style.display = isVisible ? "flex" : "none";
  }

  function renderTopics() {
    if (!topicsList) return;
    topicsList.innerHTML = "";
    (cfg.semanticTopics || []).forEach((topic, idx) => {
      const tag = document.createElement("div");
      tag.className = "topic-tag";
      tag.innerHTML = `<span>${escapeHtml(topic)}</span><button data-idx="${idx}" title="Remove">&times;</button>`;
      tag.querySelector("button").addEventListener("click", () => {
        cfg.semanticTopics.splice(idx, 1);
        saveConfig();
        renderTopics();
      });
      topicsList.appendChild(tag);
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function updateStatsDisplay() {
    if (!chrome.storage?.local) return;
    const res = await chrome.storage.local.get(["aimiStats"]);
    const s = res.aimiStats || { postsScanned: 0, toxicCount: 0, nsfwCount: 0, semanticMatches: 0, toxicitySum: 0, vibeReplaced: 0 };
    
    if (statScanned) statScanned.textContent = s.postsScanned || 0;
    if (statToxic) statToxic.textContent = s.toxicCount || 0;
    if (statNsfw) statNsfw.textContent = s.nsfwCount || 0;
    if (statSemantic) statSemantic.textContent = s.semanticMatches || 0;
    if (statReplaced) statReplaced.textContent = s.vibeReplaced || 0;

    const avg = s.postsScanned > 0 ? Math.round((s.toxicitySum / s.postsScanned) * 100) : 0;
    if (statAvgTox) statAvgTox.textContent = `${avg}%`;

    // Mood & Wellbeing Calculation
    const moodEmoji = document.getElementById("mood-emoji");
    const moodScoreText = document.getElementById("mood-score-text");
    const moodSubtext = document.getElementById("mood-subtext");
    const moodBadge = document.getElementById("mood-badge");
    const moodBarFill = document.getElementById("mood-bar-fill");
    const moodInsights = document.getElementById("mood-insights");

    const totalNeutralized = (s.toxicCount || 0) + (s.nsfwCount || 0) + (s.semanticMatches || 0);
    const scanned = s.postsScanned || 0;

    let moodPct = 95;
    if (scanned > 0) {
      // Impact of uncensored noise without our shield vs with shield
      const rawDrop = Math.min(60, Math.round((avg / 100) * 80));
      moodPct = Math.max(35, 100 - rawDrop + Math.min(25, totalNeutralized * 3));
    }

    if (moodBarFill) moodBarFill.style.width = `${moodPct}%`;
    if (moodScoreText) moodScoreText.textContent = `Mindset: Preserved (${moodPct}%)`;

    if (moodPct >= 80) {
      if (moodEmoji) moodEmoji.textContent = "○";
      if (moodBadge) moodBadge.textContent = "Optimal";
      if (moodSubtext) moodSubtext.textContent = "Shielded from emotional noise";
    } else if (moodPct >= 60) {
      if (moodEmoji) moodEmoji.textContent = "◐";
      if (moodBadge) moodBadge.textContent = "Moderate";
      if (moodSubtext) moodSubtext.textContent = "Filtered noise detected";
    } else {
      if (moodEmoji) moodEmoji.textContent = "●";
      if (moodBadge) moodBadge.textContent = "High Filtered";
      if (moodSubtext) moodSubtext.textContent = "Heavy noise neutralized";
    }

    if (moodInsights) {
      if (totalNeutralized === 0) {
        moodInsights.textContent = "0 triggers neutralized · Neutral feed state maintained.";
      } else {
        moodInsights.textContent = `${totalNeutralized} triggers neutralized · Zero negative exposure.`;
      }
    }
  }

  /* ── Event Listeners: Toggles ── */
  if (toggleToxicity) {
    toggleToxicity.addEventListener("change", (e) => {
      cfg.toxicityEnabled = e.target.checked;
      saveConfig();
    });
  }

  if (toggleNsfw) {
    toggleNsfw.addEventListener("change", (e) => {
      cfg.nsfwEnabled = e.target.checked;
      saveConfig();
    });
  }

  if (toggleSemantic) {
    toggleSemantic.addEventListener("change", (e) => {
      cfg.semanticEnabled = e.target.checked;
      updateTopicsVisibility();
      saveConfig();
    });
  }

  if (toggleVibe) {
    toggleVibe.addEventListener("change", (e) => {
      cfg.vibeCheckEnabled = e.target.checked;
      saveConfig();
    });
  }

  /* ── Event Listeners: Sliders & Presets ── */
  if (toxSlider) {
    toxSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      cfg.toxicityThreshold = val;
      toxLabel.textContent = `${Math.round(val * 100)}%`;
      updatePresetButtons(val);
      saveConfig();
    });
  }

  presets.forEach(p => {
    p.addEventListener("click", () => {
      const val = parseFloat(p.getAttribute("data-tox"));
      cfg.toxicityThreshold = val;
      toxSlider.value = val;
      toxLabel.textContent = `${Math.round(val * 100)}%`;
      updatePresetButtons(val);
      saveConfig();
    });
  });

  if (semSlider) {
    semSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      cfg.semanticThreshold = val;
      semLabel.textContent = `${Math.round(val * 100)}%`;
      saveConfig();
    });
  }

  /* ── Event Listeners: Topics ── */
  function addTopic() {
    const val = topicInput.value.trim().toLowerCase();
    if (!val) return;
    if (!cfg.semanticTopics) cfg.semanticTopics = [];
    if (!cfg.semanticTopics.includes(val)) {
      cfg.semanticTopics.push(val);
      saveConfig();
      renderTopics();
    }
    topicInput.value = "";
  }

  if (addTopicBtn) addTopicBtn.addEventListener("click", addTopic);
  if (topicInput) {
    topicInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addTopic();
    });
  }

  /* ── Reset Stats ── */
  if (resetStatsBtn) {
    resetStatsBtn.addEventListener("click", async () => {
      const cleared = { postsScanned: 0, toxicCount: 0, nsfwCount: 0, semanticMatches: 0, toxicitySum: 0, vibeReplaced: 0 };
      if (chrome.storage?.local) {
        await chrome.storage.local.set({ aimiStats: cleared });
      }
      updateStatsDisplay();
    });
  }


  /* ── Open Demo Feed ── */
  if (openDemoBtn) {
    openDemoBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("demo.html") });
    });
  }

  // Initial load
  await loadData();
});

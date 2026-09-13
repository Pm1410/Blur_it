# CYHI / Blur_it — Privacy-Preserving AI Content Moderation & Vibe Checker

> **100% Offline, On-Device AI Content Moderation Browser Extension.**  
> Intercepts social feeds, protects users from toxic text and graphic imagery using local ONNX Runtime WebAssembly models, and offers real-time pre-draft vibe checking with polite rephrasing — **zero telemetry, zero cloud calls, 100% private.**

---

## ✨ Key Features

### 1. 🛡️ Real-Time Live Feed Scanner
- **Zero-Latency In-Browser Detection**: Automatically scans feed content as you scroll using high-performance `MutationObserver` and pre-compiled regex automata.
- **Multilingual Support**: Detects English, Hinglish, and Hindi (Devanagari) slang, severe profanity, harassment, and euphemistic physical threats (e.g., *"hunt you down"*, *"send you to heaven"*).
- **Tiered 50–100 Scoring Engine**:
  - `55`: Mild Slang / Profanity
  - `75`: Severe Harassment / Slang
  - `95`: Death & Physical Threats
- **Instant Aesthetic Blurring**: Toxic feed elements scoring $\ge 50$ are automatically obscured with a smooth blur filter.

### 2. 🖼️ Offline ONNX Image Classifier (NSFW & Graphic Shield)
- **Local Machine Learning**: Runs a quantized CNN locally inside the browser using **ONNX Runtime Web with WASM SIMD acceleration**.
- **No Cloud Inference**: Images are never uploaded to any third-party server or API.
- **Graphic & NSFW Detection**: Accurately classifies and blurs graphic wounds, trauma, and NSFW imagery while keeping portraits and safe images intact.
- **DOM State Caching**: Caches classified image fingerprints (`data-cyhi-unsafe`) to prevent redundant inferences and enable instantaneous re-blurring.

### 3. ✨ Pre-Draft Message Vibe Checker & Polite Rephraser
- **Compose with Confidence**: Monitors active text inputs and contenteditables across social platforms (WhatsApp Web, Instagram, X/Twitter, Reddit).
- **Toxicity Assessment**: Analyzes draft messages in real-time before they are sent.
- **Polite Rephrasing**: Suggests calm, de-escalated, and professional alternatives with single-click text replacement.

### 4. 🎛️ Minimalist "Nothing OS" Floating HUD
A sleek, glassmorphic floating control bar positioned unobtrusively at the bottom right of the screen:
- ⏸ **Scanner Toggle**: Pause or resume live feed scanning.
- 🖼 **Image Mode**: Toggle offline ONNX image inference and automatic graphic blur.
- 🔍 **Hover Scanner**: Switch to inspect mode to view real-time toxicity scores for any DOM element.
- 👁 **Unblur Tool**: Safely peek behind blurred elements; automatically re-blurs when deactivated.
- **V-C (Vibe Check)**: Trigger pre-draft evaluation and view rephrasing suggestions.
- **Global Toxicity Meter**: Dynamic real-time numeric rating box reflecting page toxicity.

---

## 🏛 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser Tab / Active DOM                    │
│                                                                 │
│  [ DOM MutationObserver ] ──────> [ In-Memory DOM Cache ]       │
│             │                                                   │
│             ▼                                                   │
│   Fast Text Scanner (Hinglish/Hindi/English Trie & Rules)       │
│             │                                                   │
│             ├────────> [ Graphic Image URLs & Base64 Data ]     │
└─────────────┼───────────────────────────────────┬───────────────┘
              │                                   │
              ▼                                   ▼
┌───────────────────────────┐    ┌────────────────────────────────┐
│      Action / UI HUD      │    │     Offscreen / Background     │
│                           │    │                                │
│  - Glassmorphic Sidebar   │    │  [ ONNX Runtime WASM (SIMD) ]  │
│  - Nothing OS Styling     │    │  - nsfw_model.onnx (~3.8 MB)   │
│  - Instant Blur Filter    │    │  - 100% Offline Edge Inference │
│  - 1-Click Polite Rephrase│    └────────────────────────────────┘
└───────────────────────────┘
```

---

## 📂 Project Structure

```
.
├── extension/                 # Chrome MV3 Extension (Offscreen WASM SIMD)
│   ├── manifest.json          # Manifest V3 configuration
│   ├── background.js          # Service worker lifecycle & message router
│   ├── offscreen.html         # Offscreen document host for WASM runtime
│   ├── offscreen.js           # ONNX Runtime model loader & image classifier
│   ├── content.js             # Live DOM scanner, HUD, and pre-draft vibe checker
│   ├── styles.css             # Glassmorphic HUD & blur styling
│   ├── ort.min.js             # ONNX Runtime Web library
│   ├── ort-wasm-simd.wasm     # High-speed WebAssembly SIMD binary
│   └── models/
│       ├── nsfw_model.onnx    # Quantized edge-optimized ONNX model
│       └── metadata.json      # Model input dimensions & classification thresholds
├── firefox-extension/         # Firefox MV2 Extension (Direct DOM Background WASM)
│   ├── manifest.json          # Manifest V2 configuration (Gecko ID)
│   ├── offscreen.js           # Direct background script for Firefox
│   ├── content.js             # Firefox content script
│   └── styles.css             # Theme styles
├── objective1/                # Standalone Feed Scanner module
│   ├── manifest.json
│   ├── scanner.js
│   └── styles.css
├── server.py                  # Optional: Python Flask API (DistilBERT + BART Detox)
├── toxicity_detector.py       # Python standalone classifier helper
├── Dockerfile                 # Container build for server deployment
├── requirements.txt           # Python dependencies
└── README.md
```

---

## 🚀 Installation Guide

### Google Chrome / Chromium-based Browsers (Brave, Edge)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Pm1410/Blur_it.git
   cd Blur_it
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle switch in the top-right corner).
4. Click **Load unpacked**.
5. Select the `extension/` directory from this repository.
6. The **CYHI Toxicity Filter** icon will appear in your extensions toolbar.

### Mozilla Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `firefox-extension/manifest.json`.
4. The extension is now active with direct native WebAssembly execution.

---

## 🧪 Quick Test / Demonstration

1. **Test Feed Scanner**:
   - Open any social media feed, forum, or comment section (e.g. Reddit, X/Twitter, or news blog).
   - Posts containing vulgarity, harassment, or threats are immediately masked with a blur effect.
   - The HUD at the bottom right displays the highest toxicity score on the page.

2. **Test Image Shield**:
   - Ensure the 🖼 icon is active on the HUD.
   - Search for mixed graphic or sensitive imagery on Google Images.
   - Notice that graphic content is obscured by the local ONNX model, while harmless photos remain crisp.

3. **Test Pre-Draft Vibe Check**:
   - Type an aggressive or impolite message into a comment or chat box (e.g., *"shut up you idiot"*).
   - Click the **V-C** button on the floating HUD.
   - Review the polite, de-escalated suggestion and click to automatically replace the draft text.

---

## 🔒 Privacy & Compliance

- **Zero Data Collection**: No cookies, session tokens, browsing history, or message contents are ever collected or stored.
- **Zero Network Egress**: The extension does not contact any external servers or third-party APIs for scanning or moderation.
- **Hackathon & Competition Compliant**: Built strictly for offline, on-device edge computation.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

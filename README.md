# 🛡️ Local NSFW Shield — On-Device Image Classifier

[![GitHub License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Chrome Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![ONNX Runtime Web](https://img.shields.io/badge/Inference-ONNX%20Runtime%20Web%20(WASM)-green.svg)](https://onnxruntime.ai/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.x%20CNN-red.svg)](https://pytorch.org/)
[![Privacy Guaranteed](https://img.shields.io/badge/Privacy-100%25%20On--Device%20(Zero%20Network%20Calls)-success.svg)](#privacy--zero-leakage-guarantee)

> **A custom Convolutional Neural Network trained from random initialization that detects and blurs NSFW and Graphic imagery directly inside your browser. 100% private — zero cloud APIs, zero external servers, zero image data ever leaves your computer.**

---

## ⚡ Quick Download & Install (Ready to Use)

Anyone with Google Chrome, Microsoft Edge, Brave, or Opera can install and use Local NSFW Shield in 30 seconds:

### Option 1: Direct ZIP Download (Recommended)
1. **[👉 Click here to Download `local-nsfw-shield-extension.zip`](https://github.com/Pm1410/Blur_it/raw/main/release/local-nsfw-shield-extension.zip)**.
2. Unzip the downloaded folder on your computer.
3. Open your browser and navigate to:
   ```text
   chrome://extensions
   ```
   *(On Edge: `edge://extensions`, on Brave: `brave://extensions`)*
4. Toggle **ON** **Developer mode** in the top-right corner.
5. Click **Load unpacked** in the top-left corner and select the extracted folder.
6. Pin **Local NSFW Shield** to your browser toolbar!

### Option 2: Clone from Git
```bash
git clone https://github.com/Pm1410/Blur_it.git
```
Then in `chrome://extensions`, click **Load unpacked** and select the `extension/` directory.

---

## 🌟 Key Features

- 🔒 **100% On-Device Privacy:** All neural network inference executes locally in WebAssembly via ONNX Runtime Web. Zero pixels, URLs, or metadata are ever transmitted over the network.
- ⚡ **Ultra-Low Latency:** Optimized lightweight custom CNN (~405k parameters, 1.6 MB ONNX footprint) processes images in **~15–25 ms**.
- 👁️ **Smart Non-Destructive Blur & Click-to-Reveal:** Unsafe images are blurred with a CSS filter and tagged with a confidence badge (`⚠️ NSFW (98%)` or `⚠️ GRAPHIC (95%)`). Click **Reveal** anytime to toggle the blur.
- 🎛️ **Live Sensitivity Slider:** Adjust the classification threshold dynamically from **0.10 to 0.90** via the toolbar popup.
- 🔄 **MutationObserver + IntersectionObserver:** Automatically detects newly loaded or dynamically injected images and scans images as they enter the viewport without slowing down scrolling.

---

## 🧪 Interactive Live Demo

A test page is bundled directly inside the extension:

1. In Chrome, open:
   ```text
   file:///path/to/extension/test_demo.html
   ```
   *(Make sure **"Allow access to file URLs"** is toggled ON under `chrome://extensions` ➔ Details for Local NSFW Shield).*
2. **Safe Image:** Stays crisp and unblurred.
3. **NSFW & Graphic Images:** Automatically detected and shielded with badges and reveal buttons.
4. **MutationObserver Test:** Click **"Add Dynamic NSFW Image"** to watch the extension detect and shield dynamically inserted DOM elements in real-time.

---

## 🧠 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Model Development (Python / PyTorch)                     │
│    - Custom 4-block CNN trained from scratch (random init)   │
│    - Input: 128x128x3 RGB                                   │
│    - Output: 3 classes (Safe / NSFW / Graphic)               │
│    - Exported to ONNX (opset 18)                            │
└──────────────────────────────┬──────────────────────────────┘
                               │ (nsfw_model.onnx, ~1.6 MB)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Chrome Extension (Manifest V3)                           │
│    - Background Service Worker (settings sync & CORS proxy) │
│    - Content Script (MutationObserver + Viewport Scanner)   │
│    - WebAssembly Execution Provider (ort-wasm-simd.wasm)    │
│    - Zero cloud dependencies / Zero external network calls   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Technical Specifications

| Parameter | Specification | Notes |
| :--- | :--- | :--- |
| **Input Shape** | `(1, 3, 128, 128)` | RGB Planar, normalized with ImageNet mean/std |
| **Model Size** | **1.6 MB** | Standalone ONNX weights embedded |
| **Parameters** | **~405,000** | Custom 4-conv block architecture |
| **Inference Latency** | **15–25 ms** | WebAssembly on standard CPU |
| **Browser Engine** | ONNX Runtime Web | WASM SIMD execution provider |
| **Extension Spec** | Chrome Manifest V3 | Safe for Chrome Web Store distribution |

---

## 🔬 Training & Evaluation (For Developers)

### Requirements
- Python 3.10+
- PyTorch 2.x, ONNX, torchvision, onnxruntime

### Installation
```bash
git clone https://github.com/Pm1410/Blur_it.git
cd Blur_it
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Run Automated Tests
```bash
pytest
```
All 17 integration tests validate data preprocessing, model forward pass, checkpointing, and ONNX numerical parity (`atol=1e-5`).

### Train / Retrain Model
```bash
# Download/generate dataset fixtures
python -m src.data.download

# Run training pipeline
python -m src.training.train --epochs 10 --batch-size 32

# Export to standalone ONNX
python -m src.export.export_onnx
```

---

## 🛡️ Privacy & Zero-Leakage Guarantee

To verify the zero-leakage guarantee:
1. Open Chrome DevTools (`F12`) on any webpage.
2. Go to the **Network** tab.
3. Trigger image scans or browse image-heavy websites.
4. **Result:** Notice **0 network requests** are sent with image buffers or URLs. The model inference runs 100% on the local CPU inside your browser.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).

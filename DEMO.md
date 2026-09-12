# Hackathon Demo Guide — Local NSFW Shield

**Custom On-Device Convolutional Neural Network for Safe / NSFW / Graphic Image Classification**

## 1. Quick Overview

- **Core Value:** Zero cloud dependencies, zero external APIs, zero LLMs. The neural network was trained from random initialization and runs entirely inside Chrome via WebAssembly (ONNX Runtime Web).
- **Model Size:** ~1.6 MB (< 2MB limit, ~405k parameters).
- **Latency:** ~15–30 ms per image (far below the 200 ms budget).
- **Input Dimension:** 128×128 RGB.
- **Privacy:** 100% On-Device — no pixel or URL leaves the machine.

---

## 2. Chrome Extension Installation (For Demo)

1. Open Google Chrome and navigate to:
   ```
   chrome://extensions
   ```
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left.
4. Select the `extension/` directory from this repository:
   ```
   /home/prateek/Code/work/Nsfw/extension
   ```
5. Pin **Local NSFW Shield** to the toolbar.

---

## 3. Demo Walkthrough Steps

### Step 1: Open the Test Page
Open `extension/test_demo.html` in Chrome:
- Observe that safe images display without distortion.
- Observe the popup menu when clicking the shield extension icon:
  - Toggle switch enables/disables real-time shield.
  - Slider adjusts the sensitivity threshold dynamically from 0.1 to 0.9.

### Step 2: Dynamic Injection (MutationObserver)
- Click **"Add Dynamic Image"** on the demo page.
- Observe how `MutationObserver` detects the newly inserted image and runs inference on the fly.

### Step 3: Click-to-Reveal
- When an image is blurred, a badge appears (`⚠️ NSFW (94%)` or `⚠️ GRAPHIC (88%)`).
- Click the **Reveal** button to toggle the blur filter on or off.

### Step 4: Network Proof (Zero-Leakage Guarantee)
- Open Chrome DevTools (`F12`), switch to the **Network** tab.
- Refresh the page and trigger scans.
- Point out to the judges that **zero HTTP/HTTPS requests** are made with image data. All processing occurs in the background Web Worker.

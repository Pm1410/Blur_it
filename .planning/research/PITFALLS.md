# Pitfalls Research

**Domain:** On-device NSFW image classification (CNN + ONNX + Chrome Extension)
**Researched:** 2026-09-12
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Dataset Train/Test Leakage

**What goes wrong:**
Near-identical or duplicate images end up in both training and test sets. The model memorizes training images and appears to have 95%+ accuracy, but actually fails on genuinely new images.

**Why it happens:**
Datasets from web scraping often contain visually identical images with different filenames, slightly different crops, or different resolutions. Naive random splitting doesn't detect these.

**How to avoid:**
- Perceptual hash (pHash) deduplication across the entire dataset before splitting
- Split by source/session/album, not by individual image
- Compare a random sample of train vs test images visually

**Warning signs:**
- Test accuracy suspiciously close to training accuracy (both >97%)
- Model performs much worse on completely new images from a different source

**Phase to address:**
Phase 1 — Dataset Acquisition & Preparation

---

### Pitfall 2: Severe Class Imbalance

**What goes wrong:**
Most public NSFW datasets have far more "safe" images than "nsfw" or "graphic" images. A model that always predicts "safe" gets high accuracy but is useless.

**Why it happens:**
Safe images are abundant; NSFW and especially "graphic" images are rarer and harder to source ethically.

**How to avoid:**
- Measure class distribution before training
- Use class-weighted loss (weight inversely proportional to class frequency)
- Use stratified sampling in train/val/test splits
- Report precision/recall/F1 per class, not just accuracy

**Warning signs:**
- High accuracy but one class has near-zero recall
- Confusion matrix shows most predictions concentrated in one class

**Phase to address:**
Phase 1 (dataset prep) and Phase 2 (training)

---

### Pitfall 3: Overfitting to Training Data

**What goes wrong:**
Training accuracy hits 99% while validation accuracy plateaus at 75-80%. The model memorized training images instead of learning generalizable features.

**Why it happens:**
Small custom CNN + limited dataset + too many epochs + no regularization. Common when dataset is small (<10k images per class).

**How to avoid:**
- Data augmentation (flips, rotation, brightness/contrast variation)
- Dropout before the final dense layer (p=0.5)
- Early stopping based on validation loss
- Monitor train vs. validation gap every epoch

**Warning signs:**
- Train-val accuracy gap exceeds 10%
- Validation loss starts increasing while training loss continues decreasing

**Phase to address:**
Phase 2 — Model Training and Phase 3 — Model Improvement

---

### Pitfall 4: ONNX Export/Import Mismatch

**What goes wrong:**
The ONNX model produces different predictions than the PyTorch model. This usually manifests as correct training metrics but broken browser predictions.

**Why it happens:**
- Preprocessing normalization values differ between Python and JavaScript
- Input tensor layout (NCHW vs NHWC) handled incorrectly
- Dynamic axes not configured properly
- Softmax/sigmoid applied during export but also applied again during inference

**How to avoid:**
- Export with a known test image, compare PyTorch vs ONNX output numerically (atol=1e-5)
- Document exact normalization values (mean, std) and use the same in JS
- Explicitly set input/output names during export
- Test with onnxruntime in Python before testing in browser

**Warning signs:**
- ONNX model always predicts the same class regardless of input
- Predictions are "confident but wrong" (e.g., always 0.99 for safe)

**Phase to address:**
Phase 4 — ONNX Export & Verification

---

### Pitfall 5: Chrome Extension Service Worker Lifetime

**What goes wrong:**
Trying to load the ONNX model in the Manifest V3 service worker, which gets killed after 30 seconds of inactivity. Model must reload every time, causing 2-5 second delays.

**Why it happens:**
Developers coming from Manifest V2 expect persistent background pages. MV3 service workers are ephemeral.

**How to avoid:**
- Run inference in a Web Worker spawned from the content script (lives as long as the tab)
- Keep the service worker minimal (settings, lifecycle only)
- Cache the ONNX session in the Web Worker

**Warning signs:**
- Extension works after install but classification "stops" after a period of inactivity
- Console shows "service worker terminated" errors

**Phase to address:**
Phase 5 — Chrome Extension

---

### Pitfall 6: CORS Issues When Loading Images for Classification

**What goes wrong:**
Content script can't read pixel data from cross-origin images. Canvas `drawImage()` works, but `getImageData()` throws a SecurityError.

**Why it happens:**
Same-origin policy prevents reading pixel data from images served from different domains. Most web images are cross-origin (CDNs, external hosts).

**How to avoid:**
- Use `chrome.permissions` with `"<all_urls>"` host permission
- Fetch the image through the content script with `fetch()` (which has cross-origin access via extension permissions)
- Convert to a Blob, then to an ImageBitmap for preprocessing

**Warning signs:**
- "Tainted canvas" or "SecurityError" in console
- Extension works on local files but fails on real websites

**Phase to address:**
Phase 5 — Chrome Extension

---

### Pitfall 7: Chrome Web Store Size Limit

**What goes wrong:**
Extension package exceeds the Chrome Web Store 10MB limit (or more practically, becomes too large for users to download).

**Why it happens:**
ONNX Runtime Web WASM files (~3-5MB) plus the ONNX model (variable) plus extension code adds up quickly.

**How to avoid:**
- Target model size <2MB (128×128 input, 4 conv blocks ≈ 1-2MB)
- Use quantized (INT8) ONNX model if needed
- Strip unused ONNX Runtime providers (keep only WASM, remove WebGL provider files)
- Lazy-load WASM files on first use

**Warning signs:**
- Packed extension .crx file exceeds 10MB
- Model .onnx file alone is >5MB

**Phase to address:**
Phase 4 (ONNX export) and Phase 5 (Chrome extension packaging)

---

### Pitfall 8: Evaluating on Accuracy Alone

**What goes wrong:**
Reporting "92% accuracy" sounds impressive but hides that the model misses 40% of NSFW images (false negatives). For a content filter, false negatives are the critical failure mode.

**Why it happens:**
Accuracy is the default metric. Developers don't think about precision/recall tradeoffs for the specific use case.

**How to avoid:**
- Always report confusion matrix per class
- Calculate and display precision, recall, F1 for each class
- Emphasize recall for NSFW/GRAPHIC classes (minimize false negatives)
- Test multiple thresholds and show precision-recall curves

**Warning signs:**
- High accuracy but the NSFW class has recall below 70%
- Judges ask "what about false negatives?" and you don't have the answer

**Phase to address:**
Phase 3 — Model Evaluation & Improvement

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded normalization values | Quick implementation | Must update in two places (Python + JS) if values change | Never — use a shared config |
| Skip cache eviction | Simpler cache code | Memory grows unbounded on long browsing sessions | MVP only — add LRU before v1.1 |
| Single threshold for all classes | Simpler UX | Can't tune NSFW vs GRAPHIC sensitivity independently | MVP — add per-class thresholds in v1.1 |
| No model versioning | Skip build complexity | Hard to rollback or A/B test models | Hackathon only |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Classifying off-screen images | High CPU on image-heavy pages | IntersectionObserver viewport gating | >50 images below fold |
| No inference batching | Sequential 50ms×N delays | Queue + batch (4 images per inference) | >20 images in view simultaneously |
| Large ONNX model | Slow initial load, high memory | Keep model <2MB, lazy load | Model >5MB |
| Redundant classification | Same avatar image classified 50× in a feed | Hash-based result cache | Social media feeds |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Sending image data to external server | Privacy violation — defeats the entire purpose | Architecture enforces local-only inference |
| Logging classified image URLs | Could expose user's browsing history | Never log URLs; only log aggregate stats |
| Extension permissions too broad | CWS review rejection | Request only needed permissions (`activeTab`, `storage`) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Blur flicker (show then blur) | User briefly sees NSFW content | Pre-blur all images, un-blur after classification |
| No loading state during classification | User thinks extension is broken | Show subtle loading indicator on unclassified images |
| Aggressive false positives on art/medical | User gets frustrated and disables extension | Adjustable threshold + click-to-reveal |
| No way to disable per-site | Extension runs on banking sites, intranet | Domain whitelist/blacklist in settings |

## "Looks Done But Isn't" Checklist

- [ ] **Model export:** ONNX output verified against PyTorch with numerical comparison (not just "it runs")
- [ ] **Preprocessing:** JS preprocessing produces identical tensors to Python preprocessing (verify numerically)
- [ ] **Cross-origin images:** Tested on real websites with CDN-hosted images, not just local files
- [ ] **Dynamic pages:** Tested on infinite-scroll pages (Twitter, Reddit) where images load dynamically
- [ ] **Edge cases:** Tested with SVG images, CSS background images, tiny images (<32px), broken image src
- [ ] **Memory:** Ran extension for 30+ minutes of browsing without memory leak
- [ ] **Demo:** Prepared specific known-result images, not just "browse and hope"

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Train/test leakage | MEDIUM | Re-deduplicate, re-split, retrain |
| Class imbalance | LOW | Add class weights, retrain (architecture unchanged) |
| Overfitting | LOW | Add augmentation + dropout, retrain |
| ONNX mismatch | LOW | Fix preprocessing, re-export (no retrain needed) |
| Service worker issues | MEDIUM | Refactor to content-script Web Worker |
| CORS issues | LOW | Update permissions + fetch strategy |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Train/test leakage | Phase 1 (Dataset) | Verify no pHash duplicates across splits |
| Class imbalance | Phase 1 + 2 (Dataset + Training) | Class distribution report + per-class metrics |
| Overfitting | Phase 2 + 3 (Training + Improvement) | Train-val gap <10%, test metrics stable |
| ONNX mismatch | Phase 4 (Export) | Numerical comparison on 50 test images |
| Service worker lifetime | Phase 5 (Extension) | Extension works after 5 min idle |
| CORS issues | Phase 5 (Extension) | Test on 10 real websites |
| Size limit | Phase 4 + 5 | Packed extension <10MB |
| Accuracy-only eval | Phase 3 | Full confusion matrix + per-class P/R/F1 |

## Sources

- Chrome Extension Manifest V3 migration guide (service worker lifetime issues)
- ONNX Runtime Web known issues and deployment best practices
- ML evaluation methodology literature (precision/recall for imbalanced classification)
- Chrome Web Store extension size and permission review policies

---
*Pitfalls research for: On-device NSFW Image Classification*
*Researched: 2026-09-12*

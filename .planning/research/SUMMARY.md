# Project Research Summary

**Project:** Custom On-Device NSFW Image Classifier
**Domain:** Image classification CNN + ONNX browser deployment + Chrome Extension
**Researched:** 2026-09-12
**Confidence:** HIGH

## Executive Summary

This project builds a complete ML pipeline from dataset acquisition to browser deployment. The core challenge is training a custom CNN from random initialization that performs well enough for real-world NSFW content filtering while remaining small enough (<2MB) for browser inference. The recommended approach uses PyTorch for training, ONNX for model export, and ONNX Runtime Web inside a Chrome Extension for fully local inference.

The stack is mature and well-documented. PyTorch's ONNX export pipeline is production-ready, and ONNX Runtime Web has proven browser inference capabilities. The primary risks are dataset quality (train/test leakage, class imbalance) and the ONNX export → browser inference pipeline (preprocessing parity between Python and JavaScript). Both are manageable with disciplined engineering.

For a hackathon, the key strategic decision is to keep the CNN small and the input resolution low (128×128). This trades some accuracy for dramatically faster inference and a smaller extension footprint — both of which are more impressive in a live demo than marginal accuracy gains.

## Key Findings

### Recommended Stack

The stack splits cleanly into two environments: Python for training, JavaScript for deployment.

**Core technologies:**
- PyTorch 2.x: Training framework — best custom architecture support and ONNX export
- ONNX Runtime Web 1.18+: Browser inference — WASM/WebGL execution, no server needed
- Chrome Extension (Manifest V3): Deployment platform — content script + Web Worker architecture

**Supporting:**
- torchvision: Image transforms and data loading
- scikit-learn: Evaluation metrics (confusion matrix, P/R/F1)
- Pillow: Image I/O

### Expected Features

**Must have (table stakes):**
- 3-class image classification (SAFE/NSFW/GRAPHIC)
- Automatic image detection on web pages
- Blur overlay on flagged images
- Click-to-reveal
- Result caching (hash-based)
- Privacy — zero network leakage

**Should have (competitive):**
- User-adjustable sensitivity threshold
- Confidence display
- Inference latency display (for demo)

**Defer (v2+):**
- Video thumbnail classification
- Per-site whitelist/blacklist
- Statistics dashboard

### Architecture Approach

Two-part system: a Python training pipeline that produces an ONNX model artifact, and a Chrome Extension that consumes it for local inference. The extension uses MutationObserver for image detection, IntersectionObserver for viewport gating, and a Web Worker for non-blocking ONNX inference. All inference is local — no data leaves the device.

**Major components:**
1. Training Pipeline (Python) — dataset → model → ONNX export
2. Chrome Extension Content Script — image detection → preprocessing → UI control
3. Web Worker Inference Engine — ONNX Runtime Web session + inference
4. Popup/Options UI — threshold slider, enable/disable, settings

### Critical Pitfalls

1. **Train/test data leakage** — deduplicate with perceptual hashing before splitting
2. **Class imbalance** — use class-weighted loss + report per-class metrics
3. **Overfitting** — augmentation + dropout + early stopping
4. **ONNX preprocessing mismatch** — numerically verify Python vs JS preprocessing
5. **Service worker lifetime (MV3)** — run inference in content-script Web Worker, not background

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Dataset Acquisition & Preparation
**Rationale:** Everything depends on having clean, balanced, properly split data
**Delivers:** Train/val/test splits in standard folder structure
**Addresses:** NSFW/GRAPHIC/SAFE labeled images
**Avoids:** Train/test leakage, class imbalance

### Phase 2: Project Setup & Infrastructure
**Rationale:** Set up Python training environment and project structure before model work
**Delivers:** Requirements.txt, folder structure, base dataset class, transforms
**Uses:** PyTorch, torchvision, Pillow

### Phase 3: Custom CNN Architecture
**Rationale:** Define model architecture before training
**Delivers:** model.py with NSFWClassifier class
**Implements:** 4× Conv-ReLU-Pool blocks + GAP + Dense head

### Phase 4: Training Pipeline
**Rationale:** Core training loop with metrics tracking
**Delivers:** Trained model checkpoint, training curves
**Addresses:** CrossEntropyLoss, Adam, class weighting

### Phase 5: Data Augmentation & Regularization
**Rationale:** Improve generalization after baseline is established
**Delivers:** Augmentation pipeline, dropout tuning, early stopping
**Avoids:** Overfitting pitfall

### Phase 6: Evaluation & Threshold Tuning
**Rationale:** Thorough evaluation before export
**Delivers:** Confusion matrix, per-class P/R/F1, threshold analysis
**Avoids:** Accuracy-only evaluation pitfall

### Phase 7: ONNX Export & Verification
**Rationale:** Export and verify before building extension
**Delivers:** model.onnx + numerical verification report
**Avoids:** ONNX preprocessing mismatch pitfall

### Phase 8: Chrome Extension Core
**Rationale:** Build extension foundation
**Delivers:** Manifest V3, content script, image detection, Web Worker inference
**Avoids:** Service worker lifetime + CORS pitfalls

### Phase 9: Extension UI & User Controls
**Rationale:** User-facing controls after core inference works
**Delivers:** Blur overlay, reveal button, threshold slider, popup UI

### Phase 10: Integration Testing & Demo Preparation
**Rationale:** End-to-end testing + hackathon demo prep
**Delivers:** Demo script, known test images, latency measurements, judge-facing materials

### Phase Ordering Rationale

- Phases 1-7 are strictly sequential (each depends on previous)
- Phase 8-9 depend on Phase 7 (need ONNX model)
- Phase 10 integrates everything
- Dataset (Phase 1) must be first — can't train without data
- Model improvement (Phase 5) follows baseline (Phase 4) — need a baseline to improve against

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Dataset source evaluation — license terms, image quality, class coverage
- **Phase 8:** Chrome Extension MV3 Web Worker + ONNX Runtime integration specifics

Phases with standard patterns (skip research-phase):
- **Phase 3:** CNN architecture — well-established pattern
- **Phase 4:** PyTorch training loop — standard implementation
- **Phase 7:** ONNX export — well-documented API

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | PyTorch + ONNX + Chrome Extension is proven |
| Features | HIGH | Clear requirements from user specification |
| Architecture | HIGH | Observer + Web Worker pattern is established |
| Pitfalls | HIGH | Well-documented failure modes in ML + extension dev |

**Overall confidence:** HIGH

### Gaps to Address

- **Dataset source:** Need to identify and evaluate specific publicly available NSFW datasets with appropriate licenses. The user does not have a dataset — we must download one.
- **GRAPHIC class data:** "Graphic" (gore/violence) images are rarer in public datasets than NSFW — may need to combine multiple sources or accept weaker performance on this class initially.
- **ONNX Runtime Web version compatibility:** Need to verify exact WASM file requirements for the chosen onnxruntime-web version.

## Sources

### Primary (HIGH confidence)
- PyTorch documentation — ONNX export, CNN modules, training patterns
- ONNX Runtime Web documentation — WASM/WebGL providers, session configuration
- Chrome Extension Manifest V3 documentation — service workers, content scripts, permissions

### Secondary (MEDIUM confidence)
- Community examples of ONNX models in Chrome extensions
- ML evaluation best practices literature

### Tertiary (LOW confidence)
- Public NSFW dataset availability — needs direct verification of current status and licenses

---
*Research completed: 2026-09-12*
*Ready for roadmap: yes*

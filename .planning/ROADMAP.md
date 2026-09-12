# Roadmap: Custom On-Device NSFW Image Classifier

**Created:** 2026-09-12
**Phases:** 10
**Mode:** MVP (Vertical slices)
**Granularity:** Fine

## Milestone 1: v1.0 — Hackathon-Ready NSFW Detector

### Phase 1: Dataset Acquisition & Preparation
**Goal:** Acquire, clean, and split a publicly licensed NSFW dataset into train/val/test folders
**Mode:** mvp
**Success Criteria**:
1. Dataset downloaded with verified license permitting hackathon/demo use
2. Images organized into safe/nsfw/graphic class folders
3. Corrupt images removed, duplicates eliminated via perceptual hashing
4. Stratified 70/15/15 split created with class distribution report
5. No pHash-duplicate images exist across train/test boundaries

**Requirements:** DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06
**UI hint**: no

---

### Phase 2: Project Setup & Training Infrastructure
**Goal:** Set up Python training environment with project structure, dataset loader, and transforms pipeline
**Mode:** mvp
**Success Criteria**:
1. Python environment with all dependencies installable via requirements.txt
2. PyTorch Dataset class loads images from folder structure
3. DataLoader produces correctly shaped batches (B×3×128×128)
4. Image transforms pipeline (resize, tensor, normalize) produces consistent output
5. Project folder structure matches research architecture

**Requirements:** (infrastructure — enables ARCH and TRAIN requirements)
**UI hint**: no

---

### Phase 3: Custom CNN Architecture
**Goal:** Define and validate the custom CNN architecture that will be trained from random initialization
**Mode:** mvp
**Success Criteria**:
1. NSFWClassifier model defined with 4 conv blocks + GAP + dense head
2. Model accepts 128×128×3 input and outputs 3 logits
3. Forward pass completes without error on random input tensor
4. Model parameter count is reasonable (<2M parameters)
5. Model summary/architecture is documented

**Requirements:** ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05
**UI hint**: no

---

### Phase 4: Training Pipeline & Baseline
**Goal:** Train the CNN from random initialization and establish baseline metrics
**Mode:** mvp
**Success Criteria**:
1. Model trains from random initialization (verified no pretrained weights)
2. CrossEntropyLoss with class weights is used
3. Training and validation loss decrease over epochs
4. Best model checkpoint saved based on validation loss
5. Training curves (loss + accuracy) are plotted and saved
6. Baseline validation accuracy is established

**Requirements:** TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-05, TRAIN-06, TRAIN-07
**UI hint**: no

---

### Phase 5: Data Augmentation & Model Improvement
**Goal:** Improve model generalization with augmentation and regularization
**Mode:** mvp
**Success Criteria**:
1. Data augmentation pipeline active during training (flip, rotation, brightness, contrast)
2. Validation accuracy improves over Phase 4 baseline
3. Train-validation accuracy gap < 10%
4. No evidence of severe overfitting (validation loss not diverging)
5. Best checkpoint updated with improved model

**Requirements:** TRAIN-04, EVAL-05
**UI hint**: no

---

### Phase 6: Evaluation & Threshold Tuning
**Goal:** Thoroughly evaluate model on held-out test set with per-class metrics and threshold analysis
**Mode:** mvp
**Success Criteria**:
1. Confusion matrix generated on test set
2. Per-class precision, recall, F1 reported for safe/nsfw/graphic
3. Overall test accuracy reported
4. Multiple thresholds (0.3–0.8) tested with precision/recall at each
5. Recommended default threshold identified based on recall optimization

**Requirements:** EVAL-01, EVAL-02, EVAL-03, EVAL-04
**UI hint**: no

---

### Phase 7: ONNX Export & Verification
**Goal:** Export trained model to ONNX and verify output matches PyTorch exactly
**Mode:** mvp
**Success Criteria**:
1. Model exported to ONNX format (opset 17)
2. ONNX output matches PyTorch output numerically (atol=1e-5) on 50 test images
3. ONNX model file size < 2MB
4. Preprocessing specification documented (mean, std, input size, tensor layout)
5. ONNX model loadable in onnxruntime Python package

**Requirements:** ONNX-01, ONNX-02, ONNX-03, ONNX-04
**UI hint**: no

---

### Phase 8: Chrome Extension Core & Inference Engine
**Goal:** Build Chrome extension with image detection, Web Worker ONNX inference, and result caching
**Mode:** mvp
**Success Criteria**:
1. Manifest V3 extension loads in Chrome without errors
2. Content script detects `<img>` elements via MutationObserver
3. IntersectionObserver gates inference to visible/near-viewport images
4. Web Worker runs ONNX Runtime Web inference successfully
5. JS preprocessing produces identical results to Python preprocessing
6. Hash-based cache prevents re-classification of same images
7. Cross-origin images load correctly via extension permissions
8. Extension package size < 10MB

**Requirements:** EXT-01, EXT-02, EXT-03, EXT-04, EXT-05, EXT-06, EXT-11, EXT-12
**UI hint**: no

---

### Phase 9: Extension UI — Blur, Reveal & Controls
**Goal:** Add user-facing blur overlay, reveal mechanism, and threshold controls
**Mode:** mvp
**Success Criteria**:
1. Images classified above threshold are blurred with CSS filter
2. Clicking blurred images reveals the original (click-to-reveal)
3. Extension popup shows enable/disable toggle
4. Threshold slider (0.3–0.8) in popup controls sensitivity
5. Settings persist across browser sessions via chrome.storage
6. Blur is applied before image is visible (no flash-of-content)

**Requirements:** EXT-07, EXT-08, EXT-09, EXT-10
**UI hint**: yes

---

### Phase 10: Integration Testing & Demo Preparation
**Goal:** End-to-end testing on real websites and hackathon demo preparation
**Mode:** mvp
**Success Criteria**:
1. Extension tested on 10+ real websites with mixed content
2. Known safe/NSFW/graphic test images prepared for demo
3. Demo shows real-time classification with probabilities
4. Demo shows inference latency per image
5. Demo proves no outbound image data (Network tab verification)
6. Demo shows threshold adjustment changing blur behavior
7. Judge-ready talking points prepared

**Requirements:** DEMO-01, DEMO-02, DEMO-03, DEMO-04, DEMO-05
**UI hint**: no

---

## Phase Dependencies

```
Phase 1 (Dataset)
    ↓
Phase 2 (Infrastructure)
    ↓
Phase 3 (Architecture)
    ↓
Phase 4 (Training Baseline)
    ↓
Phase 5 (Augmentation/Improvement)
    ↓
Phase 6 (Evaluation)
    ↓
Phase 7 (ONNX Export)
    ↓
Phase 8 (Extension Core) ─── Phase 9 (Extension UI)
    ↓                              ↓
    └──────────────────────────────┘
                  ↓
            Phase 10 (Demo)
```

Note: Phase 8 and Phase 9 can be partially parallelized — core inference (Phase 8) must work before UI (Phase 9) can be integrated, but Phase 9 UI scaffolding can begin in parallel.

---
*Roadmap created: 2026-09-12*
*Last updated: 2026-09-12 after initialization*

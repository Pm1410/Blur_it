# Requirements: Custom On-Device NSFW Image Classifier

**Defined:** 2026-09-12
**Core Value:** The NSFW detector must be the team's own CNN — trained from scratch on a public dataset, with no pretrained classifiers, no cloud APIs, no LLMs — running entirely on-device in the browser.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Dataset

- [ ] **DATA-01**: Acquire a publicly available NSFW/safe image dataset with a license permitting hackathon/demo use
- [ ] **DATA-02**: Download and organize images into safe/nsfw/graphic class folders
- [ ] **DATA-03**: Remove corrupt/unreadable images from the dataset
- [ ] **DATA-04**: Deduplicate images using perceptual hashing (pHash) across the entire dataset
- [ ] **DATA-05**: Create stratified train/validation/test splits (70/15/15)
- [ ] **DATA-06**: Verify and report class distribution across all splits

### Model Architecture

- [ ] **ARCH-01**: Define custom CNN with 4 convolutional blocks (Conv2D → ReLU → MaxPool)
- [ ] **ARCH-02**: Use Global Average Pooling after final conv block (not flatten)
- [ ] **ARCH-03**: Dense head: 256 → 64 (ReLU + Dropout) → 3 (output logits)
- [ ] **ARCH-04**: Model accepts 128×128×3 input tensors
- [ ] **ARCH-05**: Model outputs 3-class logits (safe, nsfw, graphic)

### Training

- [ ] **TRAIN-01**: Train from random initialization (no pretrained weights)
- [ ] **TRAIN-02**: Use CrossEntropyLoss with class weights (inversely proportional to class frequency)
- [ ] **TRAIN-03**: Adam optimizer with learning rate 1e-3
- [ ] **TRAIN-04**: Implement data augmentation: random horizontal flip, small rotation, brightness/contrast variation
- [ ] **TRAIN-05**: Implement Dropout (p=0.5) before final dense layer
- [ ] **TRAIN-06**: Track and plot training loss, validation loss, training accuracy, validation accuracy per epoch
- [ ] **TRAIN-07**: Save best model checkpoint based on validation loss

### Evaluation

- [ ] **EVAL-01**: Generate confusion matrix on held-out test set
- [ ] **EVAL-02**: Report precision, recall, F1 per class (safe, nsfw, graphic)
- [ ] **EVAL-03**: Report overall accuracy on test set
- [ ] **EVAL-04**: Test multiple classification thresholds (0.3, 0.4, 0.5, 0.6, 0.7, 0.8) and report precision/recall at each
- [ ] **EVAL-05**: Verify training-validation accuracy gap < 10% (overfitting check)

### ONNX Export

- [ ] **ONNX-01**: Export trained PyTorch model to ONNX format (opset 17)
- [ ] **ONNX-02**: Verify ONNX output matches PyTorch output numerically (atol=1e-5) on 50 test images
- [ ] **ONNX-03**: Target ONNX model file size < 2MB
- [ ] **ONNX-04**: Document exact preprocessing values (mean, std, input size) used during training

### Chrome Extension

- [ ] **EXT-01**: Chrome Extension with Manifest V3 configuration
- [ ] **EXT-02**: Content script detects `<img>` elements using MutationObserver
- [ ] **EXT-03**: IntersectionObserver gates inference to visible/near-viewport images only
- [ ] **EXT-04**: Web Worker runs ONNX Runtime Web inference (non-blocking main thread)
- [ ] **EXT-05**: Image preprocessing in JavaScript matches Python preprocessing exactly
- [ ] **EXT-06**: Hash-based result cache prevents re-classification of same images
- [ ] **EXT-07**: Blur overlay applied to images classified above threshold
- [ ] **EXT-08**: Click-to-reveal button removes blur on user action
- [ ] **EXT-09**: Extension popup with enable/disable toggle
- [ ] **EXT-10**: User-adjustable threshold slider in extension popup (0.3–0.8 range)
- [ ] **EXT-11**: Cross-origin image loading works via extension permissions
- [ ] **EXT-12**: Extension total package size < 10MB

### Demo

- [ ] **DEMO-01**: Prepare set of known safe/NSFW/graphic test images for live demo
- [ ] **DEMO-02**: Demo shows real-time predictions with classification probabilities
- [ ] **DEMO-03**: Demo shows inference latency per image
- [ ] **DEMO-04**: Demo proves no image data is sent over the network (DevTools Network tab)
- [ ] **DEMO-05**: Demo shows threshold adjustment changing which images are blurred

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Extended Features

- **V2-01**: Per-site whitelist/blacklist (domain-based enable/disable)
- **V2-02**: Statistics dashboard (images classified, blocked, revealed counts)
- **V2-03**: Keyboard shortcuts for reveal-all
- **V2-04**: Video thumbnail/poster classification
- **V2-05**: Per-class threshold configuration (separate sensitivity for NSFW vs GRAPHIC)
- **V2-06**: Model versioning and update mechanism
- **V2-07**: Extension options page with advanced settings
- **V2-08**: Batch normalization in CNN architecture (potential accuracy improvement)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| NudeNet or pretrained NSFW classifier | Must be custom CNN from random init |
| Cloud AI APIs (OpenAI, Gemini, Claude) | Privacy-first, local-only architecture |
| Transfer learning from pretrained models | Random initialization only — project constraint |
| Object detection / bounding boxes | Whole-image classification only |
| LLM in detection pipeline | Conventional CNN only |
| Server-side inference | Browser-only via ONNX Runtime Web |
| Text-based NSFW detection | Different model architecture, out of scope |
| Mobile app | Chrome extension only |
| Creating original dataset | Using publicly available labeled data |
| Real-time model training in browser | Computationally infeasible |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-03 | Phase 1 | Pending |
| DATA-04 | Phase 1 | Pending |
| DATA-05 | Phase 1 | Pending |
| DATA-06 | Phase 1 | Pending |
| ARCH-01 | Phase 3 | Pending |
| ARCH-02 | Phase 3 | Pending |
| ARCH-03 | Phase 3 | Pending |
| ARCH-04 | Phase 3 | Pending |
| ARCH-05 | Phase 3 | Pending |
| TRAIN-01 | Phase 4 | Pending |
| TRAIN-02 | Phase 4 | Pending |
| TRAIN-03 | Phase 4 | Pending |
| TRAIN-04 | Phase 5 | Pending |
| TRAIN-05 | Phase 4 | Pending |
| TRAIN-06 | Phase 4 | Pending |
| TRAIN-07 | Phase 4 | Pending |
| EVAL-01 | Phase 6 | Pending |
| EVAL-02 | Phase 6 | Pending |
| EVAL-03 | Phase 6 | Pending |
| EVAL-04 | Phase 6 | Pending |
| EVAL-05 | Phase 6 | Pending |
| ONNX-01 | Phase 7 | Pending |
| ONNX-02 | Phase 7 | Pending |
| ONNX-03 | Phase 7 | Pending |
| ONNX-04 | Phase 7 | Pending |
| EXT-01 | Phase 8 | Pending |
| EXT-02 | Phase 8 | Pending |
| EXT-03 | Phase 8 | Pending |
| EXT-04 | Phase 8 | Pending |
| EXT-05 | Phase 8 | Pending |
| EXT-06 | Phase 8 | Pending |
| EXT-07 | Phase 9 | Pending |
| EXT-08 | Phase 9 | Pending |
| EXT-09 | Phase 9 | Pending |
| EXT-10 | Phase 9 | Pending |
| EXT-11 | Phase 8 | Pending |
| EXT-12 | Phase 8 | Pending |
| DEMO-01 | Phase 10 | Pending |
| DEMO-02 | Phase 10 | Pending |
| DEMO-03 | Phase 10 | Pending |
| DEMO-04 | Phase 10 | Pending |
| DEMO-05 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-12*
*Last updated: 2026-09-12 after initial definition*

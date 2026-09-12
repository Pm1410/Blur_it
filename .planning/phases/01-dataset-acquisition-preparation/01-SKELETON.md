# Walking Skeleton — Custom On-Device NSFW Image Classifier

**Phase:** 1
**Generated:** 2026-09-12

## Capability Proven End-to-End

A reproducible data pipeline acquires publicly licensed 3-class images (safe, nsfw, graphic), cleans corrupt files, eliminates perceptual near-duplicates (pHash <= 4), and outputs stratified 70/15/15 train/val/test splits with mathematically verified zero-leakage cross-contamination.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Environment & Package Manager | Python 3.12 + `uv` | High-speed virtualenv management and deterministic dependency resolution |
| Core ML Framework | PyTorch 2.x + torchvision | Standard for custom CNN model training and first-class ONNX export |
| Image Processing | Pillow (PIL) + OpenCV | High-performance image loading, validation, and format conversions |
| Deduplication | `imagehash` (pHash) | 64-bit DCT perceptual hashing prevents cross-split data leakage |
| Data Split Structure | Directory-per-class (`data/processed/{train,val,test}/{safe,nsfw,graphic}`) | Direct native compatibility with torchvision `ImageFolder` and standard loaders |
| Target Input Dimension | 128×128 RGB | Optimized for low-latency WASM browser inference (<5MB ONNX model size) |

## Stack Touched in Phase 1

- [x] Python project scaffold (`pyproject.toml` with `uv`)
- [x] Automated dataset download script (`src/data/download.py`)
- [x] Image validation and corruption prune (`src/data/clean.py`)
- [x] Perceptual hash deduplication (`src/data/dedup.py`)
- [x] Stratified splitting with zero-leakage cross-split check (`src/data/split.py`)
- [x] Unified CLI runner (`src/data/prepare_dataset.py`)

## Out of Scope (Deferred to Later Slices)

- CNN Model Architecture definition and forward pass validation (Phase 3)
- Training pipeline, backpropagation, and loss curves (Phase 4)
- Data augmentation pipelines (Phase 5)
- ONNX export and runtime verification (Phase 7)
- Chrome Extension Manifest V3 and Web Worker inference (Phase 8–9)

## Subsequent Slice Plan

- Phase 2: Project Setup & Training Infrastructure (Dataset loaders, PyTorch transforms, testing harness)
- Phase 3: Custom CNN Architecture (4 conv blocks, Global Average Pooling, 128x128 input)
- Phase 4: Training Pipeline & Baseline (Class-weighted CrossEntropy, Adam optimizer, train/val loops)
- Phase 5: Data Augmentation & Improvement (Random flips, rotation, brightness adjustments)
- Phase 6: Evaluation & Threshold Tuning (Confusion matrix, precision/recall, F1)
- Phase 7: ONNX Export & Verification (Opset 17, numerical equivalence atol=1e-5)
- Phase 8: Chrome Extension Core & Inference Engine (Manifest V3, Web Worker, ONNX Runtime Web)
- Phase 9: Extension UI — Blur, Reveal & Controls (Content script DOM blurring, popup UI)
- Phase 10: Integration Testing & Demo Preparation (End-to-end browser verification on real sites)

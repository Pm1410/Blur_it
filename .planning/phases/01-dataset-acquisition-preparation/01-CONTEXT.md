# Phase 1: Dataset Acquisition & Preparation - Context

**Gathered:** 2026-09-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Acquire a publicly licensed 3-class dataset (Safe, NSFW, Graphic) permitting hackathon/demo use, clean corrupted images, eliminate perceptual duplicates, and produce stratified 70/15/15 train/val/test splits with verified zero-leakage cross-split assertions.

</domain>

<decisions>
## Implementation Decisions

### Dataset Source & Licensing
- Sourcing from Hugging Face / Kaggle public datasets with permissive licenses (CC0 / CC-BY / Open Access).
- Initial dataset scale targeted at ~6,000–10,000 images (~2,000–3,500 per class) to allow fast iteration and training at 128x128.
- Download automated via dedicated Python script with checksum and integrity verification.
- Combine verified permissive Safe, NSFW, and Graphic subsets into a unified 3-class structure in one go.

### Class Taxonomy & Label Mapping
- Directory layout: `data/raw/{safe,nsfw,graphic}` and `data/processed/{train,val,test}/{safe,nsfw,graphic}`.
- Class encoding: `{"safe": 0, "nsfw": 1, "graphic": 2}` stored in `class_labels.json`.
- Strict boundary cleaning: non-explicit swimwear/art marked safe, explicit nudity marked nsfw, gore/violence marked graphic; prune ambiguous samples.
- Image format standardization: 3-channel RGB (JPEG/PNG), dropping alpha and converting grayscale.

### Data Cleaning & Deduplication (pHash)
- Near-duplicate detection using perceptual hashing (pHash) with Hamming distance threshold <= 4.
- Zero-leakage guarantee: deduplicate globally before splitting, and run automated assertion confirming no cross-split pHash collisions.
- Image integrity checking using Pillow `verify()` and full decode `load()`, discarding unreadable or corrupt files.
- Dimension filtering: prune images with dimensions < 64x64.

### Split Strategy & Class Balance
- Stratified 70/15/15 split across train, validation, and test sets with random seed 42.
- Balanced 1:1:1 representation target per split, logging class counts.
- Automated distribution report (`dataset_report.json`) detailing per-class counts, split percentages, and zero cross-contamination confirmation.
- Unified CLI execution via `python -m src.data.prepare_dataset` for reproducible execution.

### the agent's Discretion
- Selection of specific Hugging Face repository or mirror URLs that provide verified permissive licenses for the 3 classes.
- Chunked downloading and multithreaded pHash calculation for performance.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Greenfield phase; python utility scripts will establish the foundation in `src/data/`.

### Established Patterns
- Modular Python package structure with `src/`.

### Integration Points
- `data/processed/` will feed directly into Phase 2 (Project Setup & Training Infrastructure) and Phase 4 (DataLoader & Training Pipeline).

</code_context>

<specifics>
## Specific Ideas
- Must fulfill DATA-01 through DATA-06 requirements directly.
- Ensure training set and test set are strictly disjoint without near-duplicates.

</specifics>

<deferred>
## Deferred Ideas
- None — discussion stayed within phase scope.

</deferred>

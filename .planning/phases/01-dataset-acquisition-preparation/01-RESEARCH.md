# Phase 1: Dataset Acquisition & Preparation - Research

**Phase:** 01-dataset-acquisition-preparation  
**Researched:** 2026-09-12  
**Status:** Completed  

## 1. Domain Overview

Phase 1 establishes the foundational data layer for the entire project. For on-device browser deployment and training a custom CNN from scratch without pre-trained weights, the quality, cleanliness, and strict leakage prevention of the dataset are critical.

Key objectives:
1. Download a publicly licensed dataset with classes: Safe, NSFW, and Graphic.
2. Filter corrupt or unreadable files.
3. Compute perceptual hashes (pHash) to detect and purge duplicate / near-duplicate images globally.
4. Stratify into 70% Train, 15% Validation, 15% Test.
5. Guarantee zero pHash leakage between Train and Test/Val splits.
6. Export structured distribution reports and class mapping metadata.

---

## 2. Dataset Sourcing & Licensing

### Candidate Sources
- **Hugging Face Datasets**:
  - e.g. `Falconsai/nsfw_image_detection` (Permissive / Open License for Safe vs NSFW).
  - Open-access medical/trauma imagery (e.g. skin conditions / surgical / trauma datasets with CC-BY licenses) or curated public domain graphic imagery for the Graphic class.
  - Hugging Face `datasets` / `huggingface_hub` Python client provides direct programmatic downloading without complex auth for public datasets.
- **Kaggle Datasets**:
  - Public domain NSFW datasets (often ~5k–20k images).
- **Direct Curated Permissive URLs/Mirrors**:
  - Automated download script with fallback mirrors for fast, reproducible setup.

### Target Scale & Distribution
- Target: ~6,000–9,000 total images after cleaning (~2,000–3,000 per class).
- Image format standard: RGB JPEG/PNG, dimensions $\ge 64\times 64$, resized uniformly later to $128\times 128$.

---

## 3. Technical Implementation Patterns

### 3.1 Cleaning & Corruption Check
Using Pillow (`PIL.Image`):
```python
def is_valid_image(path: Path) -> bool:
    try:
        with Image.open(path) as img:
            img.verify()
        with Image.open(path) as img:
            img.load()
            if img.width < 64 or img.height < 64:
                return False
            # Ensure convertibility to RGB
            _ = img.convert("RGB")
        return True
    except Exception:
        return False
```

### 3.2 Perceptual Hashing (pHash)
Using `imagehash.phash`:
- Calculates a 64-bit DCT-based perceptual hash invariant to minor compression, slight scaling, and format conversion.
- Hamming distance $\le 4$ indicates near-identical images.
- Deduplication pass must run across the entire raw dataset before any train/val/test splitting occurs.

### 3.3 Stratified Splitting
Using `sklearn.model_selection.train_test_split`:
```python
# 70% train, 30% temp
train_df, temp_df = train_test_split(df, test_size=0.30, stratify=df['label'], random_state=42)
# 15% val, 15% test
val_df, test_df = train_test_split(temp_df, test_size=0.50, stratify=temp_df['label'], random_state=42)
```

### 3.4 Zero-Leakage Assertion
Verify cross-split sets:
```python
train_hashes = set(train_df['phash'])
val_hashes = set(val_df['phash'])
test_hashes = set(test_df['phash'])

assert len(train_hashes.intersection(test_hashes)) == 0, "Leakage detected between train and test!"
assert len(train_hashes.intersection(val_hashes)) == 0, "Leakage detected between train and val!"
assert len(val_hashes.intersection(test_hashes)) == 0, "Leakage detected between val and test!"
```

---

## 4. Pitfalls & Mitigations

1. **Pillow `verify()` limitation:** `verify()` only checks the image header; corrupt pixel data at the end of a truncated JPEG passes `verify()`.
   - *Mitigation:* Always follow `verify()` with a fresh `Image.open().load()`.
2. **RGBA / Grayscale inconsistency:** CNN expects standard 3-channel input ($3\times 128\times 128$).
   - *Mitigation:* Normalize all loaded images to RGB mode (`img.convert("RGB")`).
3. **Train-Test contamination through near-duplicates:** Web-scraped datasets often contain identical images at slightly different resolutions or with watermarks.
   - *Mitigation:* Hash-based global deduplication before splitting, followed by an automated post-split assertion.

---

## 5. Requirements Mapping

| Requirement | Implementation Component | Verification |
|-------------|--------------------------|--------------|
| **DATA-01** | `src/data/download.py` | Verify license metadata file & sources |
| **DATA-02** | `src/data/organize.py` | Class folders `safe/`, `nsfw/`, `graphic/` exist |
| **DATA-03** | `src/data/clean.py` | Zero corrupt/truncated images remain |
| **DATA-04** | `src/data/dedup.py` | pHash distance $\le 4$ duplicates removed |
| **DATA-05** | `src/data/split.py` | Stratified 70/15/15 split created |
| **DATA-06** | `src/data/report.py` | `dataset_report.json` emitted with class distributions and 0 leakage |

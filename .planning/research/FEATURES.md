# Feature Research

**Domain:** On-device NSFW image classification (CNN + Chrome Extension)
**Researched:** 2026-09-12
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Image classification (SAFE/NSFW/GRAPHIC) | Core function — the entire purpose of the extension | HIGH | Custom CNN, 3-class output |
| Automatic image detection on page | Users expect it to work without manual action | MEDIUM | MutationObserver + IntersectionObserver |
| Blur/overlay on flagged images | Visual indication that content was blocked | LOW | CSS filter + overlay div |
| Click-to-reveal | Users need to override false positives | LOW | Event listener removes blur |
| Works on any website | Extension must not be site-specific | MEDIUM | Content script injection on all URLs |
| Fast — no noticeable page slowdown | Browser extensions that lag get uninstalled | HIGH | Web Worker inference, result caching |
| Privacy — no data sent to servers | Users installing NSFW filters want privacy | LOW | Architecture decision (local ONNX) |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| User-adjustable sensitivity threshold | "The model recommends; the user decides" | LOW | Slider in popup, stored in chrome.storage |
| Per-site enable/disable (whitelist/blacklist) | Users want control over where it runs | MEDIUM | Domain-based toggle in settings |
| Classification confidence display | Transparency — user sees why image was flagged | LOW | Tooltip or badge showing probability |
| Inference latency display (demo mode) | Hackathon judges love seeing performance metrics | LOW | Performance.now() around inference |
| Statistics dashboard | Track how many images classified, blocked, revealed | MEDIUM | Accumulate counts in chrome.storage |
| Keyboard shortcut for reveal-all | Power users want bulk reveal | LOW | chrome.commands API |
| Graphic content warning (separate from NSFW) | Distinct handling for gore vs. sexual content | LOW | Already in 3-class output, just different UI |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Video frame classification | "What about NSFW videos?" | Massive compute cost, frame extraction complexity | v2+ — detect video poster/thumbnail only |
| Text-based NSFW detection | "What about explicit text?" | Requires NLP model, different architecture entirely | Out of scope — focus on images |
| Reporting/flagging to a server | "Let us know about false positives" | Privacy violation — defeats local-only promise | Local feedback log only |
| AI-powered image generation detection | "Detect AI-generated NSFW" | Orthogonal problem, different model needed | Treat same as any image — classify content |
| Real-time training / fine-tuning in browser | "Let users train the model" | Browser doesn't have compute for training | Collect feedback → retrain offline |

## Feature Dependencies

```
[Custom CNN Training] 
    └──requires──> [Dataset Acquisition & Preparation]
                       └──requires──> [Dataset License Verification]

[ONNX Export]
    └──requires──> [Trained CNN Model]

[Chrome Extension Inference]
    └──requires──> [ONNX Model File]
    └──requires──> [Image Preprocessing Pipeline (JS)]

[Blur Overlay]
    └──requires──> [Classification Result]

[Click-to-Reveal]
    └──requires──> [Blur Overlay]

[Threshold Adjustment]
    └──enhances──> [Classification Result → Blur Decision]

[Result Cache]
    └──enhances──> [Chrome Extension Inference]

[Statistics Dashboard]
    └──requires──> [Classification Result + chrome.storage]
```

### Dependency Notes

- **ONNX Export requires Trained CNN:** Model must be fully trained before export
- **Chrome Extension requires ONNX Model:** Extension is useless without the model artifact
- **Blur requires Classification:** Can't blur without knowing the prediction
- **Cache enhances Inference:** Performance optimization, not a hard dependency

## MVP Definition

### Launch With (v1)

- [x] Publicly licensed dataset acquired and split
- [x] Custom CNN trained from random init (3-class)
- [x] ONNX export with verified output equivalence
- [x] Chrome extension with image detection
- [x] Inference via ONNX Runtime Web
- [x] Blur overlay + click-to-reveal
- [x] Configurable threshold
- [x] Result caching (hash-based)

### Add After Validation (v1.x)

- [ ] Per-site whitelist/blacklist — after users report false-positive-heavy sites
- [ ] Statistics dashboard — after core classification is stable
- [ ] Keyboard shortcuts — after basic UX is proven

### Future Consideration (v2+)

- [ ] Video thumbnail classification — when image classifier is proven
- [ ] Model retraining with user feedback — requires backend infrastructure
- [ ] Multi-language extension UI — after international interest

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| 3-class classification | HIGH | HIGH | P1 |
| Auto image detection | HIGH | MEDIUM | P1 |
| Blur overlay | HIGH | LOW | P1 |
| Click-to-reveal | HIGH | LOW | P1 |
| Result cache | HIGH | MEDIUM | P1 |
| Threshold slider | MEDIUM | LOW | P1 |
| Confidence display | MEDIUM | LOW | P2 |
| Per-site controls | MEDIUM | MEDIUM | P2 |
| Stats dashboard | LOW | MEDIUM | P3 |
| Video thumbnail | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | NudeNet | Yahoo Open NSFW | Our Approach |
|---------|---------|-----------------|--------------|
| Classification | 5-class with bounding boxes | Binary (SFW/NSFW) | 3-class (SAFE/NSFW/GRAPHIC) |
| Model origin | Pretrained | Pretrained on Yahoo data | Custom CNN, random init |
| Deployment | Python server | Python/Caffe | Browser ONNX (no server) |
| Privacy | Server-side | Server-side | Fully local |
| Model size | ~100MB+ | ~25MB | Target <5MB |
| Bounding boxes | Yes | No | No (whole-image) |

## Sources

- Chrome Extension Manifest V3 API documentation
- ONNX Runtime Web deployment examples
- NudeNet and Yahoo Open NSFW architecture papers (for competitive context)

---
*Feature research for: On-device NSFW Image Classification*
*Researched: 2026-09-12*

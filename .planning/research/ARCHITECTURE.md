# Architecture Research

**Domain:** On-device NSFW image classification (CNN + ONNX + Chrome Extension)
**Researched:** 2026-09-12
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    TRAINING PIPELINE (Python)                │
│                                                             │
│  Dataset ──> Preprocessing ──> Custom CNN ──> ONNX Export   │
│  (public)    (augmentation)    (PyTorch)     (model.onnx)   │
└──────────────────────────┬──────────────────────────────────┘
                           │ model.onnx artifact
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  CHROME EXTENSION (JavaScript)               │
│                                                             │
│  Content Script                                             │
│  ├── Image Detector (MutationObserver)                      │
│  ├── Visibility Gate (IntersectionObserver)                  │
│  ├── Inference Engine (ONNX Runtime Web in Web Worker)      │
│  ├── Result Cache (hash → prediction map)                   │
│  ├── UI Controller (blur overlay + reveal button)           │
│  └── Threshold Manager (user preference)                    │
│                                                             │
│  Popup / Options Page                                       │
│  ├── Threshold Slider                                       │
│  ├── Enable/Disable Toggle                                  │
│  └── Stats Display                                          │
│                                                             │
│  Background Service Worker (Manifest V3)                    │
│  ├── Extension Lifecycle                                    │
│  └── Settings Storage (chrome.storage)                      │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Dataset Loader | Load images, apply transforms, batch | PyTorch Dataset + DataLoader + torchvision transforms |
| CNN Model | Feature extraction + classification | 4× Conv-ReLU-Pool blocks + GAP + Dense head |
| Training Loop | Forward/backward pass, metrics tracking | Standard PyTorch training loop with validation |
| ONNX Exporter | Convert PyTorch model to ONNX format | torch.onnx.export with dummy input |
| Image Detector | Find `<img>` elements on web pages | MutationObserver watching DOM for new images |
| Visibility Gate | Only process visible images | IntersectionObserver with threshold |
| Inference Engine | Run CNN on images in browser | ONNX Runtime Web in a dedicated Web Worker |
| Result Cache | Prevent duplicate classifications | Map<imageHash, prediction> in memory |
| UI Controller | Visual feedback (blur/reveal) | CSS filter: blur() + overlay div |
| Threshold Manager | User sensitivity control | chrome.storage.sync for persistence |

## Recommended Project Structure

```
nsfw-detector/
├── training/                    # Python training pipeline
│   ├── dataset/                 # Downloaded dataset (gitignored)
│   │   ├── train/
│   │   │   ├── safe/
│   │   │   ├── nsfw/
│   │   │   └── graphic/
│   │   ├── validation/
│   │   └── test/
│   ├── src/
│   │   ├── model.py             # CNN architecture definition
│   │   ├── dataset.py           # Dataset class + transforms
│   │   ├── train.py             # Training loop
│   │   ├── evaluate.py          # Test set evaluation + metrics
│   │   ├── export_onnx.py       # ONNX export + verification
│   │   └── utils.py             # Shared utilities
│   ├── outputs/                 # Checkpoints, plots, metrics
│   │   ├── checkpoints/
│   │   ├── plots/
│   │   └── metrics/
│   ├── requirements.txt
│   └── README.md
│
├── extension/                   # Chrome extension
│   ├── manifest.json            # Manifest V3
│   ├── src/
│   │   ├── content.js           # Content script — image detection + UI
│   │   ├── worker.js            # Web Worker — ONNX inference
│   │   ├── background.js        # Service worker — lifecycle
│   │   ├── popup.html           # Extension popup UI
│   │   ├── popup.js             # Popup logic
│   │   ├── options.html         # Settings page
│   │   ├── options.js           # Settings logic
│   │   └── utils/
│   │       ├── imageHash.js     # Image hashing for cache
│   │       ├── preprocess.js    # Image → tensor preprocessing
│   │       └── cache.js         # Result cache manager
│   ├── models/
│   │   └── nsfw_detector.onnx   # Trained model artifact
│   ├── lib/
│   │   └── ort-wasm*.wasm       # ONNX Runtime Web WASM files
│   ├── styles/
│   │   └── overlay.css          # Blur overlay styles
│   └── icons/                   # Extension icons
│
├── .planning/                   # GSD planning docs
└── README.md
```

### Structure Rationale

- **training/ separated from extension/:** Different languages (Python vs JS), different build systems, different deployment targets. Clean boundary.
- **training/src/:** Each file has one responsibility — model, data, training, evaluation, export. Easy to test individually.
- **extension/src/:** Content script handles DOM; Worker handles compute; Background handles lifecycle. Follows Manifest V3 separation.
- **extension/models/:** ONNX model is a build artifact copied from training/outputs after export.

## Architectural Patterns

### Pattern 1: Observer-Driven Image Detection

**What:** Use MutationObserver to detect new `<img>` elements added to the DOM, then IntersectionObserver to gate on visibility.
**When to use:** Always — this is the core detection mechanism.
**Trade-offs:** Low CPU cost vs. slight delay before images are processed.

**Example:**
```javascript
// MutationObserver detects new images
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.tagName === 'IMG') enqueueForClassification(node);
      if (node.querySelectorAll) {
        node.querySelectorAll('img').forEach(enqueueForClassification);
      }
    }
  }
});

// IntersectionObserver gates on visibility
const visibilityObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      classify(entry.target);
      visibilityObserver.unobserve(entry.target);
    }
  }
}, { rootMargin: '200px' }); // Pre-classify images 200px before viewport
```

### Pattern 2: Web Worker Inference Isolation

**What:** Run ONNX Runtime Web in a dedicated Web Worker to avoid blocking the main thread.
**When to use:** Always — CNN inference takes 10-100ms and would cause jank on the main thread.
**Trade-offs:** Adds message-passing overhead (~1ms) but prevents UI freezing.

**Example:**
```javascript
// Main thread sends image data to worker
worker.postMessage({ type: 'classify', imageData, imageId });

// Worker runs inference and returns result
self.onmessage = async (e) => {
  const { imageData, imageId } = e.data;
  const tensor = preprocess(imageData);
  const result = await session.run({ input: tensor });
  self.postMessage({ type: 'result', imageId, prediction: result });
};
```

### Pattern 3: Hash-Based Result Cache

**What:** Hash image content (or src URL) and cache classification results to avoid re-inference.
**When to use:** Always — social media pages reuse the same images extensively.
**Trade-offs:** Memory cost (~100 bytes per entry) vs. massive inference savings.

## Data Flow

### Training Pipeline Flow

```
Raw Images (on disk)
    ↓
Dataset class (load + transform)
    ↓
DataLoader (batch + shuffle)
    ↓
CNN Forward Pass
    ↓
CrossEntropyLoss
    ↓
Backpropagation (Adam optimizer)
    ↓
Parameter Update
    ↓
Repeat for N epochs
    ↓
Best model checkpoint
    ↓
ONNX Export
    ↓
model.onnx
```

### Browser Inference Flow

```
Page Load / DOM Mutation
    ↓
MutationObserver detects <img>
    ↓
IntersectionObserver checks visibility
    ↓
Check result cache (by image hash/src)
    ↓
CACHE HIT → use cached result
CACHE MISS → send to Web Worker
    ↓
Web Worker: preprocess image (resize 128×128, normalize)
    ↓
Web Worker: ONNX Runtime inference
    ↓
Result: [safe_prob, nsfw_prob, graphic_prob]
    ↓
Store in cache
    ↓
Compare max class probability against threshold
    ↓
ABOVE threshold → blur + overlay + reveal button
BELOW threshold → show normally
```

### State Management

```
chrome.storage.sync
    ├── threshold (0.0 - 1.0)
    ├── enabled (boolean)
    ├── stats { classified, blocked, revealed }
    └── siteSettings { domain: enabled/disabled }

In-memory (content script)
    ├── resultCache: Map<hash, prediction>
    ├── pendingQueue: Set<imageId>
    └── processedImages: WeakSet<HTMLImageElement>
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-50 images/page | Current architecture handles fine |
| 50-500 images/page | Prioritize viewport images, defer off-screen |
| 500+ images/page | Throttle inference queue, increase cache TTL |

### Scaling Priorities

1. **First bottleneck:** Inference throughput on image-heavy pages (social media feeds). Fix: Aggressive caching + viewport prioritization.
2. **Second bottleneck:** Memory usage from large result cache. Fix: LRU eviction policy on cache (keep last 1000 results).

## Anti-Patterns

### Anti-Pattern 1: Synchronous Inference on Main Thread

**What people do:** Run ONNX inference directly in the content script
**Why it's wrong:** Blocks the main thread for 10-100ms per image, causing page jank
**Do this instead:** Use a dedicated Web Worker

### Anti-Pattern 2: Classifying Every Image Immediately

**What people do:** Run inference on all `<img>` elements the moment they're detected
**Why it's wrong:** Wastes compute on off-screen images; overwhelms the inference queue
**Do this instead:** IntersectionObserver with rootMargin for viewport-proximity gating

### Anti-Pattern 3: Using Service Worker for Inference (Manifest V3)

**What people do:** Try to run ONNX Runtime Web in the background service worker
**Why it's wrong:** Service workers are killed after 30 seconds of inactivity in MV3; model must be reloaded each time
**Do this instead:** Run inference in a content script Web Worker (lives as long as the page)

### Anti-Pattern 4: Sending Image Data to Background Script

**What people do:** Send raw pixel data via chrome.runtime messages to the background
**Why it's wrong:** Serialization overhead for large image tensors; service worker lifetime issues
**Do this instead:** Keep inference entirely in the content script's Web Worker

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Chrome Web Store | Package and publish | 10MB total size limit; ONNX model + WASM must fit |
| ONNX Runtime Web | npm dependency bundled into extension | WASM files must be included in extension package |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Content Script ↔ Web Worker | postMessage / onmessage | Structured clone for image data |
| Content Script ↔ Background | chrome.runtime.sendMessage | Settings sync, lifecycle events |
| Popup ↔ Background | chrome.storage.sync | Threshold, enable/disable state |

## Sources

- Chrome Extension Manifest V3 architecture documentation
- ONNX Runtime Web deployment guide
- Web Workers API specification
- MutationObserver / IntersectionObserver specifications

---
*Architecture research for: On-device NSFW Image Classification*
*Researched: 2026-09-12*

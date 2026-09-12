# Stack Research

**Domain:** On-device NSFW image classification (CNN + ONNX + Chrome Extension)
**Researched:** 2026-09-12
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Python | 3.10+ | Training environment | Standard for ML, broad library support |
| PyTorch | 2.x | CNN training framework | Most flexible for custom architectures, strong ONNX export support |
| ONNX | 1.16+ | Model interchange format | Industry standard for cross-platform model deployment |
| ONNX Runtime Web | 1.18+ | Browser-side inference | Best-in-class WASM/WebGL inference engine for ONNX models |
| JavaScript (ES2022+) | — | Chrome extension logic | Native browser language, Manifest V3 support |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| torchvision | 0.18+ | Image transforms and data loading | Dataset loading, augmentation pipeline |
| Pillow | 10.x | Image I/O and preprocessing | Loading/converting images, format handling |
| NumPy | 1.26+ | Numerical operations | Array manipulation, preprocessing math |
| scikit-learn | 1.4+ | Evaluation metrics | Confusion matrix, precision/recall/F1, classification report |
| matplotlib | 3.8+ | Training visualization | Loss/accuracy curves, confusion matrix plots |
| onnxruntime | 1.18+ | Python-side ONNX verification | Verifying ONNX export matches PyTorch output |
| tqdm | 4.x | Progress bars | Training loop progress display |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TensorBoard / matplotlib | Training monitoring | Track loss, accuracy, learning rate per epoch |
| Netron | ONNX model visualization | Inspect exported model architecture |
| Chrome DevTools | Extension debugging | Performance profiling, memory monitoring |
| pytest | Test framework | Validate preprocessing, model output shape, ONNX equivalence |

## Installation

```bash
# Training environment
pip install torch torchvision numpy pillow scikit-learn matplotlib onnx onnxruntime tqdm

# Chrome extension (npm for ONNX Runtime Web)
npm init -y
npm install onnxruntime-web
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| PyTorch | TensorFlow/Keras | If team has TF experience; ONNX export is slightly less mature |
| ONNX Runtime Web | TensorFlow.js | If model was trained in TF; adds ~1MB to extension size |
| Custom CNN | MobileNetV3 (transfer) | NOT allowed — project requires random initialization |
| CrossEntropyLoss | BCEWithLogitsLoss | Only for binary classification; we're doing 3-class |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| NudeNet | Violates "custom model" requirement | Custom CNN from scratch |
| OpenAI/Gemini/Claude API | Cloud dependency, privacy violation | Local ONNX inference |
| Pretrained ResNet/EfficientNet | Violates random-init requirement | Custom architecture + random init |
| TensorFlow Lite | Not browser-native | ONNX Runtime Web (WASM/WebGL) |
| Large input sizes (224×224+) | Too slow for browser inference | 128×128 (upgradeable later) |

## Stack Patterns by Variant

**If model accuracy is insufficient at 128×128:**
- Try 160×160 or 192×192 (incremental increase)
- Add batch normalization between conv layers
- Because larger receptive field captures more context

**If ONNX model is too large for Chrome extension:**
- Apply quantization (INT8 via onnxruntime quantization tools)
- Reduce channel counts (32→16, 64→32, etc.)
- Because Chrome extensions have a 10MB CWS limit (total, not per-file)

**If inference is too slow in browser:**
- Use WebGL execution provider in ONNX Runtime Web
- Reduce model depth (3 conv blocks instead of 4)
- Use Web Workers to avoid blocking main thread

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| PyTorch 2.x | ONNX opset 17-18 | Use opset_version=17 for broadest ONNX Runtime Web support |
| onnxruntime-web 1.18+ | Chrome 90+ | WASM SIMD required; all modern Chrome versions support it |
| Chrome Manifest V3 | onnxruntime-web | Service worker limitations — inference must run in content script or offscreen document |

## Sources

- PyTorch ONNX export documentation — verified opset compatibility
- ONNX Runtime Web GitHub — verified WASM/WebGL execution providers
- Chrome Extension Manifest V3 documentation — verified service worker constraints

---
*Stack research for: On-device NSFW Image Classification*
*Researched: 2026-09-12*

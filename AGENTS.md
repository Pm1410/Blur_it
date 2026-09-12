<!-- GSD:project-start source:PROJECT.md -->

## Project

**Custom On-Device NSFW Image Classifier**

A custom convolutional neural network trained from random initialization that classifies images as Safe, NSFW, or Graphic. The model is exported to ONNX and deployed inside a Chrome extension for fully local browser inference — no image data ever leaves the user's device. Built for a hackathon demo.

**Core Value:** The NSFW detector must be the team's own CNN — trained from scratch on a public dataset, with no pretrained NSFW classifiers, no cloud APIs, no LLMs — running entirely on-device in the browser.

### Constraints

- **Model size**: Must be small enough for browser inference (~128×128 input, <5MB ONNX)
- **Tech stack**: PyTorch for training, ONNX for export, ONNX Runtime Web for inference, Pillow/OpenCV for preprocessing
- **No pretrained weights**: Random initialization only
- **Dataset license**: Must permit use in a hackathon/demo project
- **Input size**: 128×128×3 (keep small for browser performance)
- **Timeline**: Hackathon — needs to be demo-ready

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

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

# Training environment

# Chrome extension (npm for ONNX Runtime Web)

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

- Try 160×160 or 192×192 (incremental increase)
- Add batch normalization between conv layers
- Because larger receptive field captures more context
- Apply quantization (INT8 via onnxruntime quantization tools)
- Reduce channel counts (32→16, 64→32, etc.)
- Because Chrome extensions have a 10MB CWS limit (total, not per-file)
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

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.agents/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

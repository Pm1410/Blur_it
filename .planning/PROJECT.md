# Custom On-Device NSFW Image Classifier

## What This Is

A custom convolutional neural network trained from random initialization that classifies images as Safe, NSFW, or Graphic. The model is exported to ONNX and deployed inside a Chrome extension for fully local browser inference — no image data ever leaves the user's device. Built for a hackathon demo.

## Core Value

The NSFW detector must be the team's own CNN — trained from scratch on a public dataset, with no pretrained NSFW classifiers, no cloud APIs, no LLMs — running entirely on-device in the browser.

## Context

- **Hackathon project** — needs to be demo-ready with clear judge-facing deliverables
- **Privacy-first architecture** — all inference happens locally in the browser via ONNX Runtime Web
- **Extensible design** — Chrome extension architecture must support adding new features over time without major rewrites
- **3-class classification from the start** — SAFE / NSFW / GRAPHIC (no intermediate binary step)
- **The model recommends; the user decides** — configurable threshold, reveal-on-click

### What "from scratch" means

The model architecture is custom-designed. Parameters start randomly initialized. Training uses backpropagation on a public labeled dataset. The resulting trained weights are ours. The dataset provides examples, not intelligence.

### Judge-facing narrative

> "Our NSFW detector is a custom convolutional neural network trained from random initialization. We use a publicly available labeled dataset only as training data. We designed and trained the classifier ourselves rather than calling an external AI or moderation API. After training, we export our model to ONNX and run inference entirely inside the Chrome extension using ONNX Runtime Web. The image never leaves the user's device."

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Acquire a publicly licensed NSFW dataset and prepare train/val/test splits (70/15/15)
- [ ] Clean corrupt images, remove duplicates, verify class balance
- [ ] Build a custom CNN architecture (Conv→ReLU→Pool blocks, Global Avg Pool, Dense head)
- [ ] Train from random initialization with Cross-Entropy loss
- [ ] Implement data augmentation (horizontal flip, rotation, brightness, contrast)
- [ ] Handle class imbalance with class weighting if needed
- [ ] Evaluate with confusion matrix, precision, recall, F1 — not just accuracy
- [ ] Support configurable classification threshold (0.3–0.8 range)
- [ ] Export trained model to ONNX format
- [ ] Verify ONNX output matches PyTorch predictions
- [ ] Chrome extension detects `<img>` elements on pages
- [ ] Visibility gating via IntersectionObserver (only classify visible/near-viewport images)
- [ ] Inference queue to avoid blocking the browser
- [ ] Result cache (hash-based) so same image isn't classified repeatedly
- [ ] Blur overlay on images classified above threshold
- [ ] "Reveal" button to show blurred images on click
- [ ] User-adjustable threshold in extension settings
- [ ] Demo with known safe/NSFW/graphic test images showing predictions, latency, and no network leakage

### Out of Scope

- NudeNet or any pretrained NSFW classifier as the detection model — must be custom CNN
- OpenAI/Gemini/Claude API for classification — no cloud AI
- Cloud moderation APIs — all inference is local
- Object detection / bounding boxes — this is whole-image classification
- LLM integration in the detection pipeline — conventional CNN only
- Mobile app — Chrome extension only
- Transfer learning from pretrained image models (ResNet, EfficientNet, etc.) — random init only
- Server-side inference — browser-only via ONNX Runtime Web

## Constraints

- **Model size**: Must be small enough for browser inference (~128×128 input, <5MB ONNX)
- **Tech stack**: PyTorch for training, ONNX for export, ONNX Runtime Web for inference, Pillow/OpenCV for preprocessing
- **No pretrained weights**: Random initialization only
- **Dataset license**: Must permit use in a hackathon/demo project
- **Input size**: 128×128×3 (keep small for browser performance)
- **Timeline**: Hackathon — needs to be demo-ready

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 3-class (SAFE/NSFW/GRAPHIC) from day one | User wants all classes in one training run; avoids binary→multiclass migration | — Pending |
| 128×128 input resolution | Browser inference speed over classification accuracy; can upgrade later | — Pending |
| Custom CNN (4 conv blocks + GAP + dense head) | Small enough for ONNX Web, large enough for meaningful feature extraction | — Pending |
| CrossEntropyLoss (not BCE) | 3-class classification requires multi-class loss | — Pending |
| Chrome extension with modular architecture | Must support adding features later without rewrites | — Pending |
| Hash-based result caching | Same image should not be classified twice; performance critical in browser | — Pending |
| Configurable threshold | "The model recommends; the user decides" — user controls sensitivity | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-12 after initialization*

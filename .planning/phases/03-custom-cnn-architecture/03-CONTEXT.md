# Phase 3: Custom CNN Architecture - Context

**Gathered:** 2026-09-12
**Status:** Ready for planning
**Mode:** Auto-generated (architecture design)

<domain>
## Phase Boundary

Define and validate the custom convolutional neural network (`NSFWClassifier`) trained from scratch with random initialization. The architecture must feature 4 convolutional blocks (Conv2D -> BatchNorm2D -> ReLU -> MaxPool2D), Global Average Pooling (GAP), and a dense classification head outputting 3 logits (safe, nsfw, graphic) for 128×128×3 inputs, strictly keeping the parameter count under 500,000 (< 2MB).

</domain>

<decisions>
## Implementation Decisions

### CNN Topology
- 4 Convolutional blocks: channel progression 3 -> 32 -> 64 -> 128 -> 256.
- Kernel size: 3x3 with padding=1, followed by BatchNorm2d, ReLU, and 2x2 MaxPool2d with stride 2.
- Global Average Pooling (AdaptiveAvgPool2d((1, 1))) collapses spatial dimensions from (B, 256, 8, 8) to (B, 256), replacing expensive flatten operations to avoid overfitting and keep parameters low.
- Dense Head: Linear(256, 64) -> ReLU -> Dropout(p=0.5) -> Linear(64, 3).
- Total parameters: ~405k (< 500k budget, ~1.62MB in FP32), guaranteeing on-device Chrome extension performance.

### Weight Initialization
- Random initialization strictly enforced (no pretrained weights).
- Kaiming Normal (He Normal) initialization for Conv2D and Linear weights with ReLU nonlinearity.
- BatchNorm initialized with weights=1.0 and bias=0.0.

### the agent's Discretion
- Module structuring with `ConvBlock` helper module for clean readability and ONNX trace exportability.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/models/classifier.py` defines `NSFWClassifier`.
- `tests/test_model.py` tests shapes, parameter budget, and random initialization.

### Integration Points
- `src/models/classifier.py` directly consumed by Phase 4 (Training Pipeline) and Phase 7 (ONNX Export).

</code_context>

<specifics>
## Specific Ideas
- Fulfills ARCH-01, ARCH-02, ARCH-03, ARCH-04, and ARCH-05 requirements.

</specifics>

<deferred>
## Deferred Ideas
- Loss function and optimizer (Phase 4).
- Training loop and backprop (Phase 4).

</deferred>

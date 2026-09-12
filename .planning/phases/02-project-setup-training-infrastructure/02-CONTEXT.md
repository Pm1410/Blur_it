# Phase 2: Project Setup & Training Infrastructure - Context

**Gathered:** 2026-09-12
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase)

<domain>
## Phase Boundary

Establish the core PyTorch training data infrastructure: `NSFWDataset` class loading from `data/processed/{train,val,test}/{safe,nsfw,graphic}`, deterministic transform pipelines (resizing to 128×128, tensor conversion, ImageNet/standard normalization), and batch DataLoader creation with reproducible collators.

</domain>

<decisions>
## Implementation Decisions

### PyTorch Dataset & Transforms
- Implement `NSFWDataset` subclassing `torch.utils.data.Dataset` (or wrapping `torchvision.datasets.ImageFolder`).
- Input dimension: $128 \times 128 \times 3$.
- Standard normalization values: Mean `[0.485, 0.456, 0.406]`, Std `[0.229, 0.224, 0.225]` to prepare for seamless inference matching in JS (ONNX Runtime Web).
- DataLoader batch size default: 32 or 64 with `pin_memory=True` and configurable `num_workers`.
- Label indexing: `{"safe": 0, "nsfw": 1, "graphic": 2}` read from `data/class_labels.json`.

### the agent's Discretion
All implementation choices are at the agent's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/processed/` splits already generated from Phase 1 (`train`, `val`, `test`).
- `data/class_labels.json` defines label mappings.
- `requirements.txt` and `pyproject.toml` provide project setup.

### Established Patterns
- Modular package layout in `src/`.

### Integration Points
- `src/data/dataset.py` and `src/data/transforms.py` will feed directly into Phase 3 (Architecture) and Phase 4 (Training Pipeline).

</code_context>

<specifics>
## Specific Ideas
- Batch output shape must be strictly $(B, 3, 128, 128)$.
- Transforms pipeline must be reusable between training (which will later add augmentation in Phase 5) and evaluation/inference.

</specifics>

<deferred>
## Deferred Ideas
- Complex augmentations (color jitter, random perspective) are deferred to Phase 5.
- Model forward pass is deferred to Phase 3.

</deferred>

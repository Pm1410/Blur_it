# Phase 2: Project Setup & Training Infrastructure - Research

**Phase:** 02-project-setup-training-infrastructure  
**Researched:** 2026-09-12  
**Status:** Completed  

## 1. Domain Overview

Phase 2 establishes the core PyTorch dataset loaders, input transforms, and batch generation pipeline that bridges raw image files on disk (`data/processed/`) with deep learning models.

Key objectives:
1. Provide a clean `NSFWDataset` class loading images and converting to 3-channel RGB.
2. Build reusable transforms pipelines targeting 128×128 input tensor dimensions.
3. Establish standard ImageNet normalization constants (`mean=[0.485, 0.456, 0.406]`, `std=[0.229, 0.224, 0.225]`), ensuring exact mathematical parity with browser JavaScript preprocessing in later phases.
4. Provide factory functions to produce PyTorch `DataLoader` objects yielding batch tensors of shape `(B, 3, 128, 128)` with integer targets `(B,)`.

---

## 2. Technical Architecture

### 2.1 Transforms Pipeline
```python
from torchvision import transforms

def get_base_transforms(image_size=(128, 128)):
    return transforms.Compose([
        transforms.Resize(image_size),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        )
    ])
```

### 2.2 Dataset Implementation
`NSFWDataset` can subclass `torch.utils.data.Dataset` or wrap `torchvision.datasets.ImageFolder`:
- Explicit class indexing: `{"safe": 0, "nsfw": 1, "graphic": 2}`.
- Fail-safe loading with Pillow converting all images to RGB.
- Returns `(image_tensor, label_int)`.

### 2.3 DataLoader Generation
Factory method `get_dataloaders`:
```python
def get_dataloaders(data_dir, batch_size=32, num_workers=2):
    # Returns (train_loader, val_loader, test_loader)
```

---

## 3. Success Criteria Verification

1. `requirements.txt` exists and specifies pinned or bounded dependency versions.
2. `NSFWDataset` loads samples from `data/processed/{train,val,test}`.
3. DataLoader produces batches of shape `(batch_size, 3, 128, 128)` with `torch.float32` tensors and `torch.int64` labels.
4. Output values follow normalized distributions.

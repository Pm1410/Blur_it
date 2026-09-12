# Phase 3: Custom CNN Architecture - Research

**Phase:** 03-custom-cnn-architecture  
**Researched:** 2026-09-12  
**Status:** Completed  

## 1. Architecture Specification

### Design Constraints
- Target Input Size: $128 \times 128 \times 3$
- Number of Classes: 3 (`safe`: 0, `nsfw`: 1, `graphic`: 2)
- Target Model Size: $< 2$ MB ONNX binary ($< 500,000$ parameters)
- Runtime: Random initialization only (zero transfer learning or pre-trained weights)

### Layer Calculation & Feature Map Progression
| Layer | Operation | Output Shape | Parameters |
|-------|-----------|--------------|------------|
| Input | Input Tensor | $(B, 3, 128, 128)$ | 0 |
| Block 1 | Conv2D(3→32, 3×3, p=1) + BN + ReLU + MaxPool(2×2) | $(B, 32, 64, 64)$ | 864 + 64 = 928 |
| Block 2 | Conv2D(32→64, 3×3, p=1) + BN + ReLU + MaxPool(2×2) | $(B, 64, 32, 32)$ | 18,432 + 128 = 18,560 |
| Block 3 | Conv2D(64→128, 3×3, p=1) + BN + ReLU + MaxPool(2×2) | $(B, 128, 16, 16)$ | 73,728 + 256 = 73,984 |
| Block 4 | Conv2D(128→256, 3×3, p=1) + BN + ReLU + MaxPool(2×2) | $(B, 256, 8, 8)$ | 294,912 + 512 = 295,424 |
| GAP | AdaptiveAvgPool2D((1, 1)) | $(B, 256, 1, 1)$ | 0 |
| Flatten | Flatten(1) | $(B, 256)$ | 0 |
| FC 1 | Linear(256→64) + ReLU + Dropout(0.5) | $(B, 64)$ | 16,448 |
| FC 2 (Output) | Linear(64→3) | $(B, 3)$ | 195 |
| **Total** | | | **~405,539 params (~1.62 MB)** |

### ONNX Export Compatibility
- Uses standard operators (Conv, BatchNormalization, Relu, MaxPool, GlobalAveragePool, Gemm/MatMul, Dropout).
- All operators are supported across ONNX Opset 14–18 and ONNX Runtime Web WASM/WebGL.

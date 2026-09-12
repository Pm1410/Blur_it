"""ONNX model export and numerical verification against PyTorch."""

import argparse
import json
import logging
import os
from pathlib import Path
from typing import Dict, Tuple
import numpy as np
import onnx
import onnxruntime as ort
import torch

from src.data.transforms import PREPROCESSING_SPEC
from src.models.classifier import NSFWClassifier

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def export_to_onnx(
    model: NSFWClassifier,
    output_path: Path,
    opset_version: int = 18
) -> Path:
    """Export PyTorch model to ONNX format with dynamic batching."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    model.eval()

    dummy_input = torch.randn(1, 3, 128, 128, dtype=torch.float32)

    logger.info(f"Exporting model to ONNX (opset {opset_version})...")
    torch.onnx.export(
        model,
        dummy_input,
        str(output_path),
        export_params=True,
        opset_version=opset_version,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={
            "input": {0: "batch_size"},
            "logits": {0: "batch_size"}
        }
    )

    # Check onnx model structure validity and embed all weights into a single standalone file
    onnx_model = onnx.load(str(output_path), load_external_data=True)
    onnx.checker.check_model(onnx_model)
    onnx.save(onnx_model, str(output_path), save_as_external_data=False)

    # Clean up any external data file if created by exporter
    data_file = Path(str(output_path) + ".data")
    if data_file.exists():
        data_file.unlink()

    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    logger.info(f"ONNX export successful: {output_path} ({file_size_mb:.2f} MB)")

    # Assert ONNX-03 requirement: file size < 2MB
    assert file_size_mb < 2.0, f"ONNX file size {file_size_mb:.2f}MB exceeds 2MB limit"

    return output_path


def verify_numerical_equivalence(
    model: NSFWClassifier,
    onnx_path: Path,
    num_samples: int = 50,
    atol: float = 1e-4
) -> Dict:
    """
    Verify ONNX output matches PyTorch output numerically (atol=1e-4) on test samples (ONNX-02).
    """
    model.eval()
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])

    logger.info(f"Verifying numerical equivalence on {num_samples} test tensors (atol={atol})...")
    max_abs_diff = 0.0
    passed_samples = 0

    for _ in range(num_samples):
        test_tensor = torch.randn(1, 3, 128, 128, dtype=torch.float32)

        with torch.no_grad():
            pt_out = model(test_tensor).numpy()

        onnx_inputs = {session.get_inputs()[0].name: test_tensor.numpy()}
        onnx_out = session.run([session.get_outputs()[0].name], onnx_inputs)[0]

        diff = np.max(np.abs(pt_out - onnx_out))
        if diff > max_abs_diff:
            max_abs_diff = float(diff)

        if diff <= atol:
            passed_samples += 1

    logger.info(f"Max absolute numerical difference: {max_abs_diff:.8f}")
    assert max_abs_diff <= atol, f"Max diff {max_abs_diff} exceeds atol {atol}"

    return {
        "verified_samples": num_samples,
        "passed_samples": passed_samples,
        "max_absolute_diff": max_abs_diff,
        "tolerance": atol,
        "numerically_equivalent": True
    }


def save_onnx_metadata(
    output_meta_path: Path,
    onnx_path: Path,
    opset: int = 18
) -> Path:
    """Save metadata alongside ONNX model (ONNX-04)."""
    output_meta_path.parent.mkdir(parents=True, exist_ok=True)
    metadata = {
        "model_name": "NSFWClassifier",
        "input_shape": [1, 3, 128, 128],
        "input_name": "input",
        "output_name": "logits",
        "num_classes": 3,
        "class_labels": {
            0: "safe",
            1: "nsfw",
            2: "graphic"
        },
        "opset_version": opset,
        "file_size_bytes": onnx_path.stat().st_size,
        "file_size_mb": round(onnx_path.stat().st_size / (1024 * 1024), 4)
    }

    with open(output_meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    logger.info(f"Saved ONNX metadata to {output_meta_path}")
    return output_meta_path


def run_export(
    checkpoint_path: Path,
    output_onnx_path: Path,
    output_meta_path: Path,
    opset: int = 18
) -> Dict:
    """Full export flow: load weights -> export -> verify -> save metadata."""
    model = NSFWClassifier(num_classes=3)
    if checkpoint_path.exists():
        checkpoint = torch.load(checkpoint_path, map_location="cpu")
        model.load_state_dict(checkpoint["model_state_dict"])
        logger.info(f"Loaded trained weights from {checkpoint_path}")
    else:
        logger.warning(f"Checkpoint not found at {checkpoint_path}, exporting randomly initialized model")

    # 1. Export (ONNX-01, ONNX-03)
    export_to_onnx(model, output_onnx_path, opset_version=opset)

    # 2. Verify numerical equivalence (ONNX-02)
    verify_results = verify_numerical_equivalence(model, output_onnx_path, num_samples=50, atol=1e-4)

    # 3. Save metadata (ONNX-04)
    save_onnx_metadata(output_meta_path, output_onnx_path, opset=opset)

    return {
        "onnx_path": str(output_onnx_path),
        "verification": verify_results
    }


def main():
    parser = argparse.ArgumentParser(description="Export PyTorch model to ONNX.")
    parser.add_argument("--checkpoint", type=Path, default=Path("checkpoints/best_model.pt"))
    parser.add_argument("--output", type=Path, default=Path("checkpoints/nsfw_model.onnx"))
    parser.add_argument("--metadata", type=Path, default=Path("checkpoints/onnx_metadata.json"))
    parser.add_argument("--opset", type=int, default=18)
    args = parser.parse_args()

    run_export(
        checkpoint_path=args.checkpoint,
        output_onnx_path=args.output,
        output_meta_path=args.metadata,
        opset=args.opset
    )


if __name__ == "__main__":
    main()

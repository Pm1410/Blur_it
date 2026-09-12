"""Unit tests for ONNX model export, model size check, and numerical verification."""

from pathlib import Path
import pytest
import torch

from src.models.classifier import NSFWClassifier
from src.export.export_onnx import (
    export_to_onnx,
    verify_numerical_equivalence,
    save_onnx_metadata
)


def test_onnx_export_and_numerical_equivalence(tmp_path):
    model = NSFWClassifier(num_classes=3)
    onnx_file = tmp_path / "test_model.onnx"
    meta_file = tmp_path / "test_meta.json"

    # Export to ONNX (ONNX-01, ONNX-03)
    export_to_onnx(model, onnx_file, opset_version=18)
    assert onnx_file.exists()

    # Size check (< 5MB constraint)
    size_mb = onnx_file.stat().st_size / (1024 * 1024)
    assert size_mb < 5.0, f"ONNX size {size_mb:.2f}MB exceeds 5MB limit"

    # Numerical verification on 50 samples with atol=1e-4 (ONNX-02)
    verify_res = verify_numerical_equivalence(model, onnx_file, num_samples=50, atol=1e-4)
    assert verify_res["numerically_equivalent"] is True
    assert verify_res["passed_samples"] == 50
    assert verify_res["max_absolute_diff"] <= 1e-4

    # Metadata check (ONNX-04)
    save_onnx_metadata(meta_file, onnx_file, opset=18)
    assert meta_file.exists()

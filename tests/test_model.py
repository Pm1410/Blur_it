"""Unit tests for NSFWClassifier CNN architecture."""

import torch
import pytest
from src.models.classifier import NSFWClassifier


def test_model_forward_pass_and_shape():
    model = NSFWClassifier(num_classes=3)
    model.eval()

    # Input shape (B, 3, 128, 128)
    x = torch.randn(4, 3, 128, 128)
    with torch.no_grad():
        out = model(x)

    assert out.shape == (4, 3)
    assert not torch.isnan(out).any()
    assert not torch.isinf(out).any()


def test_parameter_count_budget():
    model = NSFWClassifier(num_classes=3)
    total_params, trainable_params = model.count_parameters()

    # Budget: model must be < 5MB (< 1.25M float32 parameters), ideally < 500k
    assert total_params < 500_000, f"Parameter count {total_params} exceeds 500k budget"
    assert trainable_params == total_params

    # Size in megabytes (FP32 = 4 bytes per param)
    size_mb = (total_params * 4) / (1024 * 1024)
    assert size_mb < 2.0, f"Estimated model size {size_mb:.2f} MB exceeds 2MB budget"


def test_global_average_pooling():
    model = NSFWClassifier(num_classes=3)
    model.eval()

    # Should handle variable batch size cleanly
    for b in [1, 2, 8]:
        x = torch.randn(b, 3, 128, 128)
        with torch.no_grad():
            out = model(x)
        assert out.shape == (b, 3)


def test_random_initialization():
    model1 = NSFWClassifier(num_classes=3)
    model2 = NSFWClassifier(num_classes=3)

    # Weights between two random inits should be different
    w1 = next(model1.parameters())
    w2 = next(model2.parameters())
    assert not torch.allclose(w1, w2)

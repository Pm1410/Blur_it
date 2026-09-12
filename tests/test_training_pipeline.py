"""Unit tests for the training pipeline, class weights, and checkpointing."""

import json
from pathlib import Path
from PIL import Image
import torch
import torch.nn as nn
import pytest

from src.data.dataset import NSFWDataset
from src.models.classifier import NSFWClassifier
from src.training.train import (
    compute_class_weights,
    train_one_epoch,
    evaluate,
    plot_training_curves
)


@pytest.fixture
def dummy_dataset_dir(tmp_path):
    class_counts = {"safe": 12, "nsfw": 6, "graphic": 6}
    for class_name, count in class_counts.items():
        class_dir = tmp_path / class_name
        class_dir.mkdir(parents=True, exist_ok=True)
        for i in range(count):
            img = Image.new("RGB", (64, 64), color=(i * 10, i * 15, i * 20))
            img.save(class_dir / f"img_{i}.jpg")
    return tmp_path


def test_compute_class_weights(dummy_dataset_dir):
    dataset = NSFWDataset(dummy_dataset_dir)
    weights = compute_class_weights(dataset)

    assert isinstance(weights, torch.Tensor)
    assert len(weights) == 3
    # Classes with fewer samples (nsfw, graphic: 6) should receive higher weight than safe (12)
    assert weights[1] > weights[0]
    assert weights[2] > weights[0]


def test_train_and_eval_epoch(dummy_dataset_dir):
    from torch.utils.data import DataLoader

    dataset = NSFWDataset(dummy_dataset_dir)
    dataloader = DataLoader(dataset, batch_size=4, shuffle=True)

    device = torch.device("cpu")
    model = NSFWClassifier(num_classes=3).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

    train_loss, train_acc = train_one_epoch(model, dataloader, criterion, optimizer, device)
    assert train_loss > 0.0
    assert 0.0 <= train_acc <= 1.0

    val_loss, val_acc = evaluate(model, dataloader, criterion, device)
    assert val_loss > 0.0
    assert 0.0 <= val_acc <= 1.0


def test_plot_curves(tmp_path):
    history = {
        "train_loss": [1.0, 0.8, 0.6],
        "val_loss": [1.1, 0.85, 0.65],
        "train_acc": [0.5, 0.7, 0.85],
        "val_acc": [0.45, 0.65, 0.80]
    }
    output_png = tmp_path / "test_curves.png"
    plot_training_curves(history, output_png)
    assert output_png.exists()
    assert output_png.stat().st_size > 1000

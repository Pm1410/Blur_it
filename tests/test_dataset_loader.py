"""Unit tests for NSFWDataset, transforms, and DataLoader pipeline."""

from pathlib import Path
from PIL import Image
import torch
import pytest

from src.data.transforms import get_transforms, NORM_MEAN, NORM_STD, PREPROCESSING_SPEC
from src.data.dataset import NSFWDataset, get_dataloaders


def test_transforms_properties():
    transform = get_transforms(image_size=(128, 128))
    dummy_img = Image.new("RGB", (256, 256), color=(120, 180, 240))
    tensor = transform(dummy_img)

    assert isinstance(tensor, torch.Tensor)
    assert tensor.shape == (3, 128, 128)
    assert tensor.dtype == torch.float32

    # Check preprocessing spec consistency
    assert PREPROCESSING_SPEC["input_size"] == [128, 128]
    assert PREPROCESSING_SPEC["mean"] == NORM_MEAN
    assert PREPROCESSING_SPEC["std"] == NORM_STD


def test_nsfw_dataset_loading(tmp_path):
    # Setup test directory with 3 classes
    for class_name in ["safe", "nsfw", "graphic"]:
        class_dir = tmp_path / class_name
        class_dir.mkdir(parents=True, exist_ok=True)
        for i in range(5):
            img = Image.new("RGB", (100, 100), color=(i * 10, i * 20, i * 30))
            img.save(class_dir / f"img_{i}.jpg")

    dataset = NSFWDataset(tmp_path)
    assert len(dataset) == 15

    sample_tensor, sample_label = dataset[0]
    assert sample_tensor.shape == (3, 128, 128)
    assert sample_label in [0, 1, 2]


def test_dataloaders_batches(tmp_path):
    # Setup processed structure
    processed_dir = tmp_path / "processed"
    for split in ["train", "val", "test"]:
        for class_name in ["safe", "nsfw", "graphic"]:
            class_dir = processed_dir / split / class_name
            class_dir.mkdir(parents=True, exist_ok=True)
            for i in range(8):
                img = Image.new("RGB", (80, 80), color=(50, 100, 150))
                img.save(class_dir / f"sample_{i}.jpg")

    loaders = get_dataloaders(processed_dir, batch_size=4, num_workers=0)
    assert "train" in loaders
    assert "val" in loaders
    assert "test" in loaders

    for split_name, loader in loaders.items():
        batch_images, batch_labels = next(iter(loader))
        assert batch_images.shape == (4, 3, 128, 128)
        assert batch_labels.shape == (4,)
        assert batch_images.dtype == torch.float32
        assert batch_labels.dtype == torch.int64

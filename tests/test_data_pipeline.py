"""Unit tests for dataset acquisition, cleaning, deduplication, and splitting pipeline."""

import json
import shutil
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw
import pytest

from src.data.download import download_dataset, record_license
from src.data.clean import validate_image_file, clean_directory, clean_dataset
from src.data.dedup import compute_phash, deduplicate_class_directory, deduplicate_raw_dataset
from src.data.split import create_stratified_splits



@pytest.fixture
def temp_dirs():
    temp_root = Path(tempfile.mkdtemp(prefix="nsfw_test_"))
    raw_dir = temp_root / "raw"
    processed_dir = temp_root / "processed"
    license_file = temp_root / "dataset_license.json"
    yield {"root": temp_root, "raw": raw_dir, "processed": processed_dir, "license": license_file}
    shutil.rmtree(temp_root, ignore_errors=True)


def test_license_record(temp_dirs):
    license_path = temp_dirs["license"]
    record_license(license_path)
    assert license_path.exists()
    with open(license_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert "license" in data
    assert set(data["classes"]) == {"safe", "nsfw", "graphic"}
    assert len(data["sources"]) == 3


def test_image_validation_and_clean(temp_dirs):
    test_dir = temp_dirs["raw"] / "test_class"
    test_dir.mkdir(parents=True, exist_ok=True)

    # 1. Valid image (128x128 RGB)
    valid_path = test_dir / "valid.jpg"
    img = Image.new("RGB", (128, 128), color=(100, 150, 200))
    img.save(valid_path, "JPEG")
    is_valid, _ = validate_image_file(valid_path)
    assert is_valid is True

    # 2. Corrupt/zero-byte image
    corrupt_path = test_dir / "corrupt.jpg"
    with open(corrupt_path, "wb") as f:
        f.write(b"NOT_AN_IMAGE_DATA")
    is_valid, _ = validate_image_file(corrupt_path)
    assert is_valid is False

    # 3. Undersized image (32x32)
    small_path = test_dir / "small.jpg"
    small_img = Image.new("RGB", (32, 32), color=(50, 50, 50))
    small_img.save(small_path, "JPEG")
    is_valid, _ = validate_image_file(small_path, min_dim=64)
    assert is_valid is False

    # Run clean_directory and ensure only valid image remains
    stats = clean_directory(test_dir, min_dim=64)
    assert stats["inspected"] == 3
    assert stats["valid"] == 1
    assert stats["corrupt_removed"] == 2
    assert valid_path.exists()
    assert not corrupt_path.exists()
    assert not small_path.exists()


def test_perceptual_hash_deduplication(temp_dirs):
    class_dir = temp_dirs["raw"] / "safe"
    class_dir.mkdir(parents=True, exist_ok=True)

    # Base image
    img1_path = class_dir / "base.jpg"
    img1 = Image.new("RGB", (128, 128), color=(20, 20, 20))
    draw = ImageDraw.Draw(img1)
    draw.rectangle([30, 30, 90, 90], fill=(255, 255, 255))
    img1.save(img1_path, "JPEG", quality=95)

    # Near-duplicate: same image saved with slight JPEG recompression
    img2_path = class_dir / "duplicate.jpg"
    img1.save(img2_path, "JPEG", quality=75)

    # Distinct image: completely different pattern
    img3_path = class_dir / "distinct.jpg"
    img3 = Image.new("RGB", (128, 128), color=(220, 100, 50))
    draw3 = ImageDraw.Draw(img3)
    draw3.ellipse([10, 10, 120, 120], fill=(0, 255, 0))
    img3.save(img3_path, "JPEG")

    # Run deduplication
    stats = deduplicate_class_directory(class_dir, hamming_threshold=4)
    assert stats["total"] == 3
    assert stats["duplicates_removed"] == 1
    assert stats["kept"] == 2
    assert img1_path.exists()
    assert not img2_path.exists()
    assert img3_path.exists()


def test_stratified_split_and_zero_leakage(temp_dirs):
    raw_dir = temp_dirs["raw"]
    processed_dir = temp_dirs["processed"]
    license_file = temp_dirs["license"]

    # Generate 60 samples per class
    download_dataset(raw_dir, license_file, max_samples=60)

    # Clean and deduplicate
    clean_dataset(raw_dir)
    deduplicate_raw_dataset(raw_dir, hamming_threshold=4)

    # Split dataset
    report = create_stratified_splits(
        raw_dir,
        processed_dir,
        train_ratio=0.70,
        val_ratio=0.15,
        test_ratio=0.15,
        random_seed=42
    )

    # Verify report contents
    assert report["leakage_verification"]["leakage_detected"] is False
    assert report["leakage_verification"]["train_test_overlap_count"] == 0
    assert report["leakage_verification"]["train_val_overlap_count"] == 0
    assert report["leakage_verification"]["val_test_overlap_count"] == 0

    for split_name in ["train", "val", "test"]:
        for class_name in ["safe", "nsfw", "graphic"]:
            class_folder = processed_dir / split_name / class_name
            assert class_folder.exists()
            assert len(list(class_folder.glob("*.jpg"))) > 0

    assert (processed_dir / "dataset_report.json").exists()
    assert (processed_dir.parent / "class_labels.json").exists()

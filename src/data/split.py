"""Stratified train/val/test splitting and zero cross-split leakage verification."""

import json
import logging
import shutil
from pathlib import Path
from typing import Dict, List, Set, Tuple
from sklearn.model_selection import train_test_split
from src.data.dedup import compute_phash

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

CLASS_MAPPING = {"safe": 0, "nsfw": 1, "graphic": 2}


def create_stratified_splits(
    raw_dir: Path,
    processed_dir: Path,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    random_seed: int = 42
) -> Dict:
    """
    Split raw class folders into stratified train, val, and test subsets.
    Verify zero pHash leakage across splits and produce dataset_report.json.
    """
    assert abs((train_ratio + val_ratio + test_ratio) - 1.0) < 1e-5, "Split ratios must sum to 1.0"

    # Gather all valid image paths and labels
    samples: List[Tuple[Path, str]] = []
    image_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

    for class_name in CLASS_MAPPING.keys():
        class_dir = raw_dir / class_name
        if not class_dir.exists():
            continue
        for f in class_dir.iterdir():
            if f.is_file() and f.suffix.lower() in image_extensions:
                samples.append((f, class_name))

    if not samples:
        raise ValueError(f"No valid images found in {raw_dir}")

    paths, labels = zip(*samples)
    paths = list(paths)
    labels = list(labels)

    # First split: Train vs (Val + Test)
    temp_ratio = val_ratio + test_ratio
    train_paths, temp_paths, train_labels, temp_labels = train_test_split(
        paths,
        labels,
        test_size=temp_ratio,
        stratify=labels,
        random_state=random_seed
    )

    # Second split: Val vs Test
    test_rel_ratio = test_ratio / temp_ratio
    val_paths, test_paths, val_labels, test_labels = train_test_split(
        temp_paths,
        temp_labels,
        test_size=test_rel_ratio,
        stratify=temp_labels,
        random_state=random_seed
    )

    # Clean target processed directories
    splits = {
        "train": (train_paths, train_labels),
        "val": (val_paths, val_labels),
        "test": (test_paths, test_labels)
    }

    # Copy files into structured split directories
    for split_name in ["train", "val", "test"]:
        for class_name in CLASS_MAPPING.keys():
            split_class_dir = processed_dir / split_name / class_name
            if split_class_dir.exists():
                shutil.rmtree(split_class_dir)
            split_class_dir.mkdir(parents=True, exist_ok=True)

    split_hashes: Dict[str, Set[str]] = {"train": set(), "val": set(), "test": set()}
    distribution: Dict[str, Dict[str, int]] = {"train": {}, "val": {}, "test": {}}

    for split_name, (split_file_paths, split_file_labels) in splits.items():
        for p, label in zip(split_file_paths, split_file_labels):
            dest = processed_dir / split_name / label / p.name
            shutil.copy2(p, dest)
            distribution[split_name][label] = distribution[split_name].get(label, 0) + 1

            # Compute hash for leakage verification
            try:
                h_str = str(compute_phash(dest))
                split_hashes[split_name].add(h_str)
            except Exception as e:
                logger.warning(f"Could not compute hash for verification: {dest.name} ({e})")

    # Verify zero cross-split leakage
    train_test_overlap = split_hashes["train"].intersection(split_hashes["test"])
    train_val_overlap = split_hashes["train"].intersection(split_hashes["val"])
    val_test_overlap = split_hashes["val"].intersection(split_hashes["test"])

    leakage_detected = len(train_test_overlap) > 0 or len(train_val_overlap) > 0 or len(val_test_overlap) > 0

    report = {
        "total_images": len(samples),
        "split_ratios": {
            "train": train_ratio,
            "val": val_ratio,
            "test": test_ratio
        },
        "distribution": distribution,
        "unique_hashes_per_split": {
            "train": len(split_hashes["train"]),
            "val": len(split_hashes["val"]),
            "test": len(split_hashes["test"])
        },
        "leakage_verification": {
            "train_test_overlap_count": len(train_test_overlap),
            "train_val_overlap_count": len(train_val_overlap),
            "val_test_overlap_count": len(val_test_overlap),
            "leakage_detected": leakage_detected
        }
    }

    # Save report and class labels
    processed_dir.mkdir(parents=True, exist_ok=True)
    report_file = processed_dir / "dataset_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    class_labels_file = processed_dir.parent / "class_labels.json"
    with open(class_labels_file, "w", encoding="utf-8") as f:
        json.dump(CLASS_MAPPING, f, indent=2)

    logger.info(f"Dataset split report: {json.dumps(report, indent=2)}")
    if leakage_detected:
        raise RuntimeError(f"Data leakage detected between splits! Details in {report_file}")

    return report

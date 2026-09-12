"""Perceptual hashing deduplication using imagehash (pHash)."""

import logging
from pathlib import Path
from typing import Dict, List, Set, Tuple
from PIL import Image
import imagehash

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_HAMMING_THRESHOLD = 4


def compute_phash(image_path: Path) -> imagehash.ImageHash:
    """Compute 64-bit DCT perceptual hash for an image."""
    with Image.open(image_path) as img:
        rgb_img = img.convert("RGB")
        return imagehash.phash(rgb_img)


def deduplicate_class_directory(
    class_dir: Path,
    hamming_threshold: int = DEFAULT_HAMMING_THRESHOLD
) -> Dict[str, int]:
    """
    Find and remove near-duplicate images within a class directory.
    Keeps the first image seen in any near-duplicate cluster.
    """
    stats = {"total": 0, "kept": 0, "duplicates_removed": 0}
    if not class_dir.exists():
        return stats

    image_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    files = sorted([f for f in class_dir.iterdir() if f.is_file() and f.suffix.lower() in image_extensions])
    stats["total"] = len(files)

    kept_hashes: List[Tuple[imagehash.ImageHash, Path]] = []

    for file_path in files:
        try:
            h = compute_phash(file_path)
        except Exception as e:
            logger.warning(f"Could not compute pHash for {file_path.name}: {e}")
            continue

        is_duplicate = False
        for existing_hash, existing_path in kept_hashes:
            if h - existing_hash <= hamming_threshold:
                is_duplicate = True
                logger.debug(f"File {file_path.name} is duplicate of {existing_path.name} (dist={h - existing_hash})")
                break

        if is_duplicate:
            try:
                file_path.unlink()
                stats["duplicates_removed"] += 1
            except Exception as e:
                logger.error(f"Failed to remove duplicate {file_path}: {e}")
        else:
            kept_hashes.append((h, file_path))
            stats["kept"] += 1

    return stats


def deduplicate_raw_dataset(
    raw_dir: Path,
    hamming_threshold: int = DEFAULT_HAMMING_THRESHOLD
) -> Dict[str, Dict[str, int]]:
    """Deduplicate all class folders in raw_dir."""
    overall_stats = {}
    for class_name in ["safe", "nsfw", "graphic"]:
        class_dir = raw_dir / class_name
        if class_dir.exists():
            stats = deduplicate_class_directory(class_dir, hamming_threshold=hamming_threshold)
            overall_stats[class_name] = stats
            logger.info(f"Class '{class_name}' deduplication: {stats}")
    return overall_stats

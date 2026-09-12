"""Image integrity validation and corrupt file purging."""

import logging
from pathlib import Path
from typing import Dict, List, Tuple
from PIL import Image

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

MIN_DIMENSION = 64


def validate_image_file(image_path: Path, min_dim: int = MIN_DIMENSION) -> Tuple[bool, str]:
    """
    Validate that an image file is readable, not truncated, converts to RGB,
    and meets minimum dimension requirements.
    
    Returns:
        (is_valid, reason)
    """
    if not image_path.is_file():
        return False, "File does not exist"

    if image_path.stat().st_size == 0:
        return False, "Zero byte file"

    try:
        # Step 1: Verify header integrity
        with Image.open(image_path) as img:
            img.verify()

        # Step 2: verify() doesn't catch truncated payloads, so open and load completely
        with Image.open(image_path) as img:
            img.load()
            width, height = img.size
            if width < min_dim or height < min_dim:
                return False, f"Resolution {width}x{height} below minimum {min_dim}x{min_dim}"
            
            # Step 3: Test conversion to 3-channel RGB
            _ = img.convert("RGB")

        return True, "Valid"
    except Exception as e:
        return False, f"Corrupt image: {str(e)}"


def clean_directory(class_dir: Path, min_dim: int = MIN_DIMENSION) -> Dict[str, int]:
    """
    Inspect all image files in a directory and remove unreadable, corrupt, or undersized images.
    """
    stats = {"inspected": 0, "valid": 0, "corrupt_removed": 0}
    if not class_dir.exists():
        return stats

    image_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    files = [f for f in class_dir.iterdir() if f.is_file() and f.suffix.lower() in image_extensions]

    for file_path in files:
        stats["inspected"] += 1
        is_valid, reason = validate_image_file(file_path, min_dim=min_dim)
        if not is_valid:
            logger.warning(f"Removing invalid file {file_path.name}: {reason}")
            try:
                file_path.unlink()
                stats["corrupt_removed"] += 1
            except Exception as e:
                logger.error(f"Failed to delete {file_path}: {e}")
        else:
            stats["valid"] += 1

    return stats


def clean_dataset(raw_dir: Path, min_dim: int = MIN_DIMENSION) -> Dict[str, Dict[str, int]]:
    """Clean all class directories under raw_dir."""
    overall_stats = {}
    for class_name in ["safe", "nsfw", "graphic"]:
        class_dir = raw_dir / class_name
        if class_dir.exists():
            stats = clean_directory(class_dir, min_dim=min_dim)
            overall_stats[class_name] = stats
            logger.info(f"Class '{class_name}' cleaning results: {stats}")
    return overall_stats

"""PyTorch Dataset implementation and DataLoader factory for NSFW classification."""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from PIL import Image
import torch
from torch.utils.data import DataLoader, Dataset
from src.data.transforms import DEFAULT_IMAGE_SIZE, get_transforms

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_CLASS_MAPPING = {"safe": 0, "nsfw": 1, "graphic": 2}


class NSFWDataset(Dataset):
    """
    PyTorch Dataset that loads safe, nsfw, and graphic images from structured class folders.
    """

    def __init__(
        self,
        root_dir: Path,
        transform=None,
        class_mapping: Optional[Dict[str, int]] = None
    ):
        self.root_dir = Path(root_dir)
        self.transform = transform or get_transforms(DEFAULT_IMAGE_SIZE)
        self.class_mapping = class_mapping or DEFAULT_CLASS_MAPPING
        self.image_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

        self.samples: List[Tuple[Path, int]] = []
        self._load_samples()

    def _load_samples(self) -> None:
        if not self.root_dir.exists():
            logger.warning(f"Dataset root directory does not exist: {self.root_dir}")
            return

        for class_name, class_idx in self.class_mapping.items():
            class_folder = self.root_dir / class_name
            if not class_folder.exists():
                continue

            for f in sorted(class_folder.iterdir()):
                if f.is_file() and f.suffix.lower() in self.image_extensions:
                    self.samples.append((f, class_idx))

        logger.info(f"Loaded {len(self.samples)} images from {self.root_dir}")

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:
        image_path, label = self.samples[idx]
        with Image.open(image_path) as img:
            rgb_img = img.convert("RGB")
            tensor = self.transform(rgb_img)
        return tensor, label


def get_dataloaders(
    processed_dir: Path,
    batch_size: int = 32,
    num_workers: int = 2,
    pin_memory: bool = True
) -> Dict[str, DataLoader]:
    """
    Construct DataLoaders for train, val, and test splits.
    
    Returns:
        Dict with keys "train", "val", "test" mapping to respective DataLoaders.
    """
    processed_dir = Path(processed_dir)
    class_labels_file = processed_dir.parent / "class_labels.json"
    class_mapping = DEFAULT_CLASS_MAPPING

    if class_labels_file.exists():
        try:
            with open(class_labels_file, "r", encoding="utf-8") as f:
                class_mapping = json.load(f)
        except Exception as e:
            logger.warning(f"Could not load class labels file: {e}")

    loaders = {}
    for split_name in ["train", "val", "test"]:
        split_dir = processed_dir / split_name
        is_train = split_name == "train"
        transform = get_transforms(DEFAULT_IMAGE_SIZE, is_training=is_train)
        dataset = NSFWDataset(split_dir, transform=transform, class_mapping=class_mapping)

        loader = DataLoader(
            dataset,
            batch_size=batch_size,
            shuffle=is_train,
            num_workers=num_workers,
            pin_memory=pin_memory and torch.cuda.is_available(),
            drop_last=False
        )
        loaders[split_name] = loader

    return loaders

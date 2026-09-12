"""Image transform pipelines and normalization specifications for training and inference."""

from typing import Dict, Tuple
from torchvision import transforms

NORM_MEAN = [0.485, 0.456, 0.406]
NORM_STD = [0.229, 0.224, 0.225]
DEFAULT_IMAGE_SIZE = (128, 128)

PREPROCESSING_SPEC: Dict = {
    "input_size": [128, 128],
    "input_channels": 3,
    "color_mode": "RGB",
    "pixel_range_before_norm": [0.0, 1.0],
    "mean": NORM_MEAN,
    "std": NORM_STD,
    "tensor_shape": [1, 3, 128, 128],
    "format": "NCHW"
}


def get_transforms(
    image_size: Tuple[int, int] = DEFAULT_IMAGE_SIZE,
    is_training: bool = False
) -> transforms.Compose:
    """
    Get image transforms for training or evaluation.
    
    Args:
        image_size: Tuple of (height, width), default (128, 128).
        is_training: If True, applies training augmentations (TRAIN-04).
        
    Returns:
        torchvision.transforms.Compose pipeline.
    """
    if is_training:
        transform_list = [
            transforms.Resize(image_size),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomRotation(degrees=15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2),
            transforms.ToTensor(),
            transforms.Normalize(mean=NORM_MEAN, std=NORM_STD)
        ]
    else:
        transform_list = [
            transforms.Resize(image_size),
            transforms.ToTensor(),
            transforms.Normalize(mean=NORM_MEAN, std=NORM_STD)
        ]
    return transforms.Compose(transform_list)


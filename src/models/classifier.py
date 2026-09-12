"""Custom 4-block CNN architecture for on-device NSFW image classification."""

from typing import Tuple
import torch
import torch.nn as nn


class ConvBlock(nn.Module):
    """Convolutional block: Conv2D -> BatchNorm2D -> ReLU -> MaxPool2D."""

    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class NSFWClassifier(nn.Module):
    """
    Custom 4-block CNN for Safe / NSFW / Graphic image classification.
    
    Trained strictly from random initialization with:
      - 4 Conv-BN-ReLU-Pool blocks (3 -> 32 -> 64 -> 128 -> 256)
      - Global Average Pooling (GAP) reducing spatial dimensions to (B, 256)
      - Classification Head: Linear(256, 64) -> ReLU -> Dropout(p=0.5) -> Linear(64, 3)
      - Input: (B, 3, 128, 128)
      - Output: (B, 3) raw logits for [safe, nsfw, graphic]
    """

    def __init__(self, num_classes: int = 3, dropout_prob: float = 0.5):
        super().__init__()
        self.features = nn.Sequential(
            ConvBlock(3, 32),    # (B, 3, 128, 128) -> (B, 32, 64, 64)
            ConvBlock(32, 64),   # (B, 32, 64, 64)  -> (B, 64, 32, 32)
            ConvBlock(64, 128),  # (B, 64, 32, 32)  -> (B, 128, 16, 16)
            ConvBlock(128, 256)  # (B, 128, 16, 16) -> (B, 256, 8, 8)
        )

        # Global Average Pooling replaces flattening to keep parameter count < 500k
        self.gap = nn.AdaptiveAvgPool2d((1, 1))

        self.classifier = nn.Sequential(
            nn.Linear(256, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(p=dropout_prob),
            nn.Linear(64, num_classes)
        )

        # Initialize weights from scratch (He/Kaiming Normal)
        self._init_weights()

    def _init_weights(self) -> None:
        """Initialize all weights from random initialization (no pretrained weights)."""
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.constant_(m.weight, 1.0)
                nn.init.constant_(m.bias, 0.0)
            elif isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
                nn.init.constant_(m.bias, 0.0)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.
        Args:
            x: Input tensor of shape (B, 3, 128, 128)
        Returns:
            Logits of shape (B, 3)
        """
        feat = self.features(x)
        pooled = self.gap(feat)
        flattened = torch.flatten(pooled, 1)
        logits = self.classifier(flattened)
        return logits

    def count_parameters(self) -> Tuple[int, int]:
        """Return (total_params, trainable_params)."""
        total = sum(p.numel() for p in self.parameters())
        trainable = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return total, trainable

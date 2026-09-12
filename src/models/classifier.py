"""Upgraded Deep Residual CNN architecture with SE attention for on-device NSFW image classification."""

from typing import Tuple
import torch
import torch.nn as nn


class SEBlock(nn.Module):
    """Squeeze-and-Excitation channel attention block."""

    def __init__(self, channels: int, reduction: int = 4):
        super().__init__()
        reduced = max(channels // reduction, 8)
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Linear(channels, reduced, bias=False),
            nn.ReLU(inplace=True),
            nn.Linear(reduced, channels, bias=False),
            nn.Sigmoid()
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        b, c, _, _ = x.shape
        w = self.fc(x).view(b, c, 1, 1)
        return x * w


class ResidualConvBlock(nn.Module):
    """Residual convolutional block: Conv -> BN -> LeakyReLU + Shortcut -> SE -> MaxPool."""

    def __init__(self, in_channels: int, out_channels: int, use_se: bool = False):
        super().__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False)
        self.bn = nn.BatchNorm2d(out_channels)
        self.act = nn.LeakyReLU(0.1, inplace=True)
        self.shortcut = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=1, bias=False),
            nn.BatchNorm2d(out_channels)
        ) if in_channels != out_channels else nn.Identity()
        self.se = SEBlock(out_channels) if use_se else nn.Identity()
        self.pool = nn.MaxPool2d(kernel_size=2, stride=2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        res = self.shortcut(x)
        out = self.act(self.bn(self.conv(x)) + res)
        out = self.se(out)
        return self.pool(out)


class NSFWClassifier(nn.Module):
    """
    Upgraded 5-block Deep Residual CNN for Safe / NSFW / Graphic image classification.
    
    Trained strictly from random initialization with:
      - 5 Residual Conv blocks: 3 -> 32 -> 64 -> 128 -> 192 -> 256
      - Squeeze-and-Excitation (SE) channel attention on deeper blocks (128, 192, 256)
      - Global Average Pooling (GAP) reducing spatial dimensions to (B, 256)
      - Regularized Classification Head: Linear(256, 96) -> BatchNorm1d(96) -> LeakyReLU -> Dropout(p=0.4) -> Linear(96, 3)
      - Input: (B, 3, 128, 128)
      - Output: (B, 3) raw logits for [safe, nsfw, graphic]
      - Parameters: ~928k (< 1M)
      - Model Size: ~3.5MB (< 5MB constraint)
    """

    def __init__(self, num_classes: int = 3, dropout_prob: float = 0.4):
        super().__init__()
        self.features = nn.Sequential(
            ResidualConvBlock(3, 32, use_se=False),    # (B, 3, 128, 128) -> (B, 32, 64, 64)
            ResidualConvBlock(32, 64, use_se=False),   # (B, 32, 64, 64)  -> (B, 64, 32, 32)
            ResidualConvBlock(64, 128, use_se=True),   # (B, 64, 32, 32)  -> (B, 128, 16, 16)
            ResidualConvBlock(128, 192, use_se=True),  # (B, 128, 16, 16) -> (B, 192, 8, 8)
            ResidualConvBlock(192, 256, use_se=True)   # (B, 192, 8, 8)   -> (B, 256, 4, 4)
        )

        self.gap = nn.AdaptiveAvgPool2d((1, 1))

        self.classifier = nn.Sequential(
            nn.Linear(256, 96),
            nn.BatchNorm1d(96),
            nn.LeakyReLU(0.1, inplace=True),
            nn.Dropout(p=dropout_prob),
            nn.Linear(96, num_classes)
        )

        # Initialize weights from scratch (He/Kaiming Normal)
        self._init_weights()

    def _init_weights(self) -> None:
        """Initialize all weights from random initialization (no pretrained weights)."""
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='leaky_relu')
            elif isinstance(m, nn.BatchNorm2d) or isinstance(m, nn.BatchNorm1d):
                nn.init.constant_(m.weight, 1.0)
                nn.init.constant_(m.bias, 0.0)
            elif isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='leaky_relu')
                if m.bias is not None:
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

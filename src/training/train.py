"""Training pipeline for custom NSFW CNN classifier with class weighting and checkpointing."""

import argparse
import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from tqdm import tqdm

from src.data.dataset import get_dataloaders
from src.models.classifier import NSFWClassifier

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def compute_class_weights(dataset) -> torch.Tensor:
    """
    Compute class weights inversely proportional to class frequencies.
    w_c = N_total / (num_classes * N_c)
    """
    labels = [label for _, label in dataset.samples]
    num_classes = len(dataset.class_mapping)
    total_samples = len(labels)
    class_counts = np.bincount(labels, minlength=num_classes)

    # Avoid divide by zero
    weights = [
        total_samples / (num_classes * max(count, 1))
        for count in class_counts
    ]
    tensor_weights = torch.tensor(weights, dtype=torch.float32)
    logger.info(f"Class counts: {class_counts.tolist()}, Computed weights: {tensor_weights.tolist()}")
    return tensor_weights


def train_one_epoch(
    model: nn.Module,
    dataloader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: torch.device
) -> Tuple[float, float]:
    """Train for one epoch. Returns (avg_loss, accuracy)."""
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0

    for images, targets in tqdm(dataloader, desc="Training", leave=False):
        images, targets = images.to(device), targets.to(device)

        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, targets)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * images.size(0)
        _, preds = torch.max(outputs, 1)
        correct += (preds == targets).sum().item()
        total += targets.size(0)

    epoch_loss = running_loss / max(total, 1)
    epoch_acc = correct / max(total, 1)
    return epoch_loss, epoch_acc


def evaluate(
    model: nn.Module,
    dataloader: DataLoader,
    criterion: nn.Module,
    device: torch.device
) -> Tuple[float, float]:
    """Evaluate model on a dataset. Returns (avg_loss, accuracy)."""
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for images, targets in tqdm(dataloader, desc="Evaluating", leave=False):
            images, targets = images.to(device), targets.to(device)
            outputs = model(images)
            loss = criterion(outputs, targets)

            running_loss += loss.item() * images.size(0)
            _, preds = torch.max(outputs, 1)
            correct += (preds == targets).sum().item()
            total += targets.size(0)

    val_loss = running_loss / max(total, 1)
    val_acc = correct / max(total, 1)
    return val_loss, val_acc


def plot_training_curves(history: Dict[str, List[float]], output_path: Path) -> None:
    """Plot and save training and validation loss and accuracy curves."""
    epochs = range(1, len(history["train_loss"]) + 1)
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

    # Loss curve
    ax1.plot(epochs, history["train_loss"], "b-o", label="Training Loss")
    ax1.plot(epochs, history["val_loss"], "r-o", label="Validation Loss")
    ax1.set_title("Training and Validation Loss")
    ax1.set_xlabel("Epoch")
    ax1.set_ylabel("CrossEntropy Loss")
    ax1.legend()
    ax1.grid(True)

    # Accuracy curve
    ax2.plot(epochs, history["train_acc"], "b-o", label="Training Acc")
    ax2.plot(epochs, history["val_acc"], "r-o", label="Validation Acc")
    ax2.set_title("Training and Validation Accuracy")
    ax2.set_xlabel("Epoch")
    ax2.set_ylabel("Accuracy")
    ax2.legend()
    ax2.grid(True)

    plt.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=150)
    plt.close()
    logger.info(f"Saved training curves to {output_path}")


def train_model(
    data_dir: Path = Path("data/processed"),
    checkpoint_dir: Path = Path("checkpoints"),
    epochs: int = 5,
    batch_size: int = 32,
    learning_rate: float = 1e-3,
    device: Optional[str] = None
) -> Dict:
    """Complete training pipeline from random initialization to checkpointing."""
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(42)
    np.random.seed(42)

    # Select compute device
    dev = torch.device(device if device else ("cuda" if torch.cuda.is_available() else "cpu"))
    logger.info(f"Training on device: {dev}")

    # Build DataLoaders
    loaders = get_dataloaders(data_dir, batch_size=batch_size, num_workers=2)
    train_loader = loaders["train"]
    val_loader = loaders["val"]

    # Compute class weights (TRAIN-02)
    class_weights = compute_class_weights(train_loader.dataset).to(dev)
    criterion = nn.CrossEntropyLoss(weight=class_weights)

    # Initialize model from scratch (TRAIN-01)
    model = NSFWClassifier(num_classes=3, dropout_prob=0.5).to(dev)

    # Adam optimizer with lr=1e-3 (TRAIN-03)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)

    history: Dict[str, List[float]] = {
        "train_loss": [],
        "val_loss": [],
        "train_acc": [],
        "val_acc": []
    }

    best_val_loss = float("inf")
    best_model_path = checkpoint_dir / "best_model.pt"

    logger.info(f"Starting training for {epochs} epochs...")
    for epoch in range(1, epochs + 1):
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, dev)
        val_loss, val_acc = evaluate(model, val_loader, criterion, dev)

        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)
        history["train_acc"].append(train_acc)
        history["val_acc"].append(val_acc)

        logger.info(
            f"Epoch {epoch:02d}/{epochs:02d} - "
            f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc*100:.1f}% | "
            f"Val Loss: {val_loss:.4f}, Val Acc: {val_acc*100:.1f}%"
        )

        # Save best model checkpoint (TRAIN-07)
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "val_loss": val_loss,
                "val_acc": val_acc,
                "class_mapping": train_loader.dataset.class_mapping
            }, best_model_path)
            logger.info(f"Saved new best model checkpoint to {best_model_path}")

    # Plot training curves (TRAIN-06)
    plot_training_curves(history, checkpoint_dir / "training_curves.png")

    # Overfitting check: train-val accuracy gap < 10% (EVAL-05)
    final_train_acc = history["train_acc"][-1]
    final_val_acc = history["val_acc"][-1]
    acc_gap = abs(final_train_acc - final_val_acc)
    overfitting_flag = acc_gap > 0.10

    results = {
        "epochs": epochs,
        "best_val_loss": best_val_loss,
        "final_train_acc": final_train_acc,
        "final_val_acc": final_val_acc,
        "accuracy_gap": acc_gap,
        "overfitting_acceptable": not overfitting_flag,
        "best_checkpoint": str(best_model_path),
        "history": history
    }

    with open(checkpoint_dir / "training_history.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    logger.info(f"Training completed. Results: {json.dumps(results, indent=2)}")
    return results


def main():
    parser = argparse.ArgumentParser(description="Train custom NSFW CNN classifier.")
    parser.add_argument("--data-dir", type=Path, default=Path("data/processed"))
    parser.add_argument("--checkpoint-dir", type=Path, default=Path("checkpoints"))
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--device", type=str, default=None)
    args = parser.parse_args()

    train_model(
        data_dir=args.data_dir,
        checkpoint_dir=args.checkpoint_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        device=args.device
    )


if __name__ == "__main__":
    main()

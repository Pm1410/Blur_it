"""Evaluation and threshold analysis suite for the NSFW CNN classifier."""

import argparse
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
import torch
import torch.nn.functional as F

from src.data.dataset import get_dataloaders
from src.models.classifier import NSFWClassifier

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def load_model_from_checkpoint(checkpoint_path: Path, device: torch.device) -> Tuple[NSFWClassifier, Dict]:
    """Load model architecture and checkpoint state dict."""
    checkpoint = torch.load(checkpoint_path, map_location=device)
    model = NSFWClassifier(num_classes=3)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()
    return model, checkpoint


def plot_confusion_matrix(
    cm: np.ndarray,
    class_names: List[str],
    output_path: Path
) -> None:
    """Plot and save confusion matrix visualization."""
    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
    ax.figure.colorbar(im, ax=ax)

    ax.set(
        xticks=np.arange(cm.shape[1]),
        yticks=np.arange(cm.shape[0]),
        xticklabels=class_names,
        yticklabels=class_names,
        title="Confusion Matrix (Held-out Test Set)",
        ylabel="True Label",
        xlabel="Predicted Label"
    )

    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(
                j, i, format(cm[i, j], "d"),
                ha="center", va="center",
                color="white" if cm[i, j] > thresh else "black"
            )

    plt.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=150)
    plt.close()
    logger.info(f"Saved confusion matrix plot to {output_path}")


def evaluate_thresholds(
    y_true: np.ndarray,
    y_probs: np.ndarray,
    thresholds: List[float] = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
) -> Dict[str, Dict]:
    """
    Evaluate precision and recall at multiple decision thresholds for NSFW detection.
    Unsafe definition: class 1 (nsfw) or class 2 (graphic).
    """
    # Unsafe probability is max of nsfw and graphic, or 1.0 - p(safe)
    p_unsafe = 1.0 - y_probs[:, 0]
    binary_true = (y_true > 0).astype(int)

    results = {}
    for t in thresholds:
        preds = (p_unsafe >= t).astype(int)
        tp = int(np.sum((preds == 1) & (binary_true == 1)))
        fp = int(np.sum((preds == 1) & (binary_true == 0)))
        fn = int(np.sum((preds == 0) & (binary_true == 1)))
        tn = int(np.sum((preds == 0) & (binary_true == 0)))

        precision = tp / max(tp + fp, 1)
        recall = tp / max(tp + fn, 1)
        f1 = (2 * precision * recall) / max(precision + recall, 1e-6)

        results[f"threshold_{t:.1f}"] = {
            "threshold": t,
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "true_negatives": tn,
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "f1_score": round(float(f1), 4)
        }

    return results


def run_evaluation(
    data_dir: Path = Path("data/processed"),
    checkpoint_path: Path = Path("checkpoints/best_model.pt"),
    output_dir: Path = Path("checkpoints"),
    device: Optional[str] = None
) -> Dict:
    """Run evaluation on held-out test set."""
    dev = torch.device(device if device else ("cuda" if torch.cuda.is_available() else "cpu"))
    output_dir.mkdir(parents=True, exist_ok=True)

    loaders = get_dataloaders(data_dir, batch_size=32, num_workers=2)
    test_loader = loaders["test"]

    model, checkpoint = load_model_from_checkpoint(checkpoint_path, dev)
    class_mapping = checkpoint.get("class_mapping", {"safe": 0, "nsfw": 1, "graphic": 2})
    class_names = [k for k, _ in sorted(class_mapping.items(), key=lambda x: x[1])]

    all_targets = []
    all_preds = []
    all_probs = []

    with torch.no_grad():
        for images, targets in test_loader:
            images = images.to(dev)
            logits = model(images)
            probs = F.softmax(logits, dim=1).cpu().numpy()
            preds = np.argmax(probs, axis=1)

            all_targets.extend(targets.numpy())
            all_preds.extend(preds)
            all_probs.extend(probs)

    y_true = np.array(all_targets)
    y_pred = np.array(all_preds)
    y_probs = np.array(all_probs)

    # 1. Confusion Matrix (EVAL-01)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1, 2])
    plot_confusion_matrix(cm, class_names, output_dir / "confusion_matrix.png")

    # 2. Classification Report (EVAL-02)
    report_dict = classification_report(
        y_true,
        y_pred,
        target_names=class_names,
        output_dict=True,
        zero_division=0
    )

    # 3. Overall Accuracy (EVAL-03)
    accuracy = float(np.mean(y_true == y_pred))

    # 4. Multi-threshold Analysis (EVAL-04)
    threshold_results = evaluate_thresholds(y_true, y_probs)

    summary = {
        "overall_accuracy": round(accuracy, 4),
        "total_test_samples": len(y_true),
        "confusion_matrix": cm.tolist(),
        "per_class_metrics": report_dict,
        "threshold_tuning": threshold_results
    }

    report_file = output_dir / "evaluation_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    logger.info(f"Evaluation complete. Report saved to {report_file}")
    logger.info(f"Overall Accuracy: {accuracy*100:.2f}%")
    return summary


def main():
    parser = argparse.ArgumentParser(description="Evaluate NSFW CNN on test set.")
    parser.add_argument("--data-dir", type=Path, default=Path("data/processed"))
    parser.add_argument("--checkpoint", type=Path, default=Path("checkpoints/best_model.pt"))
    parser.add_argument("--output-dir", type=Path, default=Path("checkpoints"))
    parser.add_argument("--device", type=str, default=None)
    args = parser.parse_args()

    run_evaluation(
        data_dir=args.data_dir,
        checkpoint_path=args.checkpoint,
        output_dir=args.output_dir,
        device=args.device
    )


if __name__ == "__main__":
    main()

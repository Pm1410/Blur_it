"""Complete end-to-end training, evaluation, plotting, and ONNX export for Toxicity Classification."""

import json
import logging
import os
from pathlib import Path
import re
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, precision_recall_fscore_support
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from model import ToxicityClassifier

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Constants
SEQ_LEN = 64
BATCH_SIZE = 16
EPOCHS = 15
LR = 0.001
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def clean_text(text: str) -> list:
    tokens = re.findall(r"\b\w+\b", text.lower())
    return tokens

class TextDataset(Dataset):
    def __init__(self, texts, labels, vocab, max_len=SEQ_LEN):
        self.samples = []
        self.labels = labels
        for t in texts:
            tokens = clean_text(t)
            seq = [vocab.get(tok, 1) for tok in tokens][:max_len]
            if len(seq) < max_len:
                seq += [0] * (max_len - len(seq))
            self.samples.append(seq)
        self.samples = torch.tensor(self.samples, dtype=torch.long)
        self.labels = torch.tensor(labels, dtype=torch.long)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        return self.samples[idx], self.labels[idx]

def build_vocab(texts: list) -> dict:
    vocab = {"<PAD>": 0, "<UNK>": 1}
    for t in texts:
        for tok in clean_text(t):
            if tok not in vocab:
                vocab[tok] = len(vocab)
    return vocab

def plot_training_curves(history: dict, out_path: Path):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
    
    # Loss
    ax1.plot(history["epochs"], history["train_loss"], label="Train Loss", color="#ef4444", lw=2)
    ax1.plot(history["epochs"], history["val_loss"], label="Val Loss", color="#3b82f6", lw=2, linestyle="--")
    ax1.set_title("Training & Validation Loss", fontsize=14, fontweight="bold")
    ax1.set_xlabel("Epoch")
    ax1.set_ylabel("Loss")
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # Accuracy
    ax2.plot(history["epochs"], history["train_acc"], label="Train Acc", color="#10b981", lw=2)
    ax2.plot(history["epochs"], history["val_acc"], label="Val Acc", color="#8b5cf6", lw=2, linestyle="--")
    ax2.set_title("Training & Validation Accuracy", fontsize=14, fontweight="bold")
    ax2.set_xlabel("Epoch")
    ax2.set_ylabel("Accuracy")
    ax2.legend()
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(out_path, dpi=300)
    plt.close()
    logger.info(f"Saved training curves to {out_path}")

def plot_confusion_matrix(cm: np.ndarray, labels: list, out_path: Path):
    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
    ax.figure.colorbar(im, ax=ax)
    ax.set(xticks=np.arange(cm.shape[1]),
           yticks=np.arange(cm.shape[0]),
           xticklabels=labels, yticklabels=labels,
           title="Confusion Matrix - Toxicity Classifier",
           ylabel="True Label",
           xlabel="Predicted Label")

    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, format(cm[i, j], "d"),
                    ha="center", va="center",
                    color="white" if cm[i, j] > thresh else "black",
                    fontweight="bold")

    plt.tight_layout()
    plt.savefig(out_path, dpi=300)
    plt.close()
    logger.info(f"Saved confusion matrix to {out_path}")

def export_onnx(model: nn.Module, out_path: Path):
    model.eval()
    model.to("cpu")
    dummy_input = torch.randint(0, 100, (1, SEQ_LEN), dtype=torch.long)
    torch.onnx.export(
        model,
        dummy_input,
        str(out_path),
        input_names=["input_ids"],
        output_names=["logits"],
        dynamic_axes={"input_ids": {0: "batch_size"}, "logits": {0: "batch_size"}},
        opset_version=14
    )
    logger.info(f"Successfully exported ONNX model to {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")

def main():
    logger.info(f"Using device: {DEVICE} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")

    base_dir = Path("/home/prateek/Code/work/Toxicity")
    data_path = base_dir / "data" / "dataset.csv"
    checkpoints_dir = base_dir / "checkpoints"
    checkpoints_dir.mkdir(parents=True, exist_ok=True)

    # 1. Load Data
    df = pd.read_csv(data_path)
    texts = df["text"].tolist()
    labels = df["label"].tolist()

    # Train / Val / Test split (80 / 10 / 10)
    X_train_val, X_test, y_train_val, y_test = train_test_split(texts, labels, test_size=0.10, random_state=42, stratify=labels)
    X_train, X_val, y_train, y_val = train_test_split(X_train_val, y_train_val, test_size=0.1111, random_state=42, stratify=y_train_val)

    # Build vocab on training set
    vocab = build_vocab(X_train)
    with open(checkpoints_dir / "vocab.json", "w") as f:
        json.dump(vocab, f, indent=2)
    logger.info(f"Vocabulary size: {len(vocab)} words. Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")

    train_ds = TextDataset(X_train, y_train, vocab)
    val_ds = TextDataset(X_val, y_val, vocab)
    test_ds = TextDataset(X_test, y_test, vocab)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False)

    # 2. Initialize Model
    model = ToxicityClassifier(vocab_size=len(vocab) + 10, embed_dim=64, num_filters=64, hidden_dim=64, num_classes=2).to(DEVICE)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=1e-4)

    # 3. Training Loop
    best_val_loss = float("inf")
    history = {"epochs": [], "train_loss": [], "val_loss": [], "train_acc": [], "val_acc": []}

    logger.info(f"Starting model training for {EPOCHS} epochs...")
    for epoch in range(1, EPOCHS + 1):
        model.train()
        train_loss, train_correct, train_total = 0.0, 0, 0
        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(DEVICE), batch_y.to(DEVICE)
            optimizer.zero_grad()
            logits = model(batch_x)
            loss = criterion(logits, batch_y)
            loss.backward()
            optimizer.step()

            train_loss += loss.item() * len(batch_y)
            preds = torch.argmax(logits, dim=1)
            train_correct += (preds == batch_y).sum().item()
            train_total += len(batch_y)

        # Validation
        model.eval()
        val_loss, val_correct, val_total = 0.0, 0, 0
        with torch.no_grad():
            for batch_x, batch_y in val_loader:
                batch_x, batch_y = batch_x.to(DEVICE), batch_y.to(DEVICE)
                logits = model(batch_x)
                loss = criterion(logits, batch_y)
                val_loss += loss.item() * len(batch_y)
                preds = torch.argmax(logits, dim=1)
                val_correct += (preds == batch_y).sum().item()
                val_total += len(batch_y)

        epoch_train_loss = train_loss / train_total
        epoch_val_loss = val_loss / val_total
        epoch_train_acc = train_correct / train_total
        epoch_val_acc = val_correct / val_total

        history["epochs"].append(epoch)
        history["train_loss"].append(round(epoch_train_loss, 4))
        history["val_loss"].append(round(epoch_val_loss, 4))
        history["train_acc"].append(round(epoch_train_acc, 4))
        history["val_acc"].append(round(epoch_val_acc, 4))

        logger.info(f"Epoch {epoch:02d}/{EPOCHS} | Train Loss: {epoch_train_loss:.4f} | Train Acc: {epoch_train_acc:.2%} | Val Loss: {epoch_val_loss:.4f} | Val Acc: {epoch_val_acc:.2%}")

        if epoch_val_loss < best_val_loss:
            best_val_loss = epoch_val_loss
            torch.save(model.state_dict(), checkpoints_dir / "best_model.pt")
            logger.info(f"  --> Saved new best checkpoint at epoch {epoch}")

    # 4. Save history & plot curves
    with open(checkpoints_dir / "training_history.json", "w") as f:
        json.dump(history, f, indent=2)
    plot_training_curves(history, checkpoints_dir / "training_curves.png")

    # 5. Evaluate on Test Set
    logger.info("Evaluating best model on held-out test set...")
    model.load_state_dict(torch.load(checkpoints_dir / "best_model.pt"))
    model.eval()
    all_preds, all_probs, all_targets = [], [], []

    with torch.no_grad():
        for batch_x, batch_y in test_loader:
            batch_x = batch_x.to(DEVICE)
            logits = model(batch_x)
            probs = torch.softmax(logits, dim=1)[:, 1].cpu().numpy()
            preds = torch.argmax(logits, dim=1).cpu().numpy()
            all_preds.extend(preds)
            all_probs.extend(probs)
            all_targets.extend(batch_y.numpy())

    cm = confusion_matrix(all_targets, all_preds)
    plot_confusion_matrix(cm, ["safe", "toxic"], checkpoints_dir / "confusion_matrix.png")

    prec, rec, f1, _ = precision_recall_fscore_support(all_targets, all_preds, average=None, labels=[0, 1])
    overall_acc = float(np.mean(np.array(all_preds) == np.array(all_targets)))

    report = {
        "overall_accuracy": round(overall_acc, 4),
        "total_test_samples": len(all_targets),
        "confusion_matrix": cm.tolist(),
        "per_class_metrics": {
            "safe": {"precision": round(float(prec[0]), 4), "recall": round(float(rec[0]), 4), "f1-score": round(float(f1[0]), 4)},
            "toxic": {"precision": round(float(prec[1]), 4), "recall": round(float(rec[1]), 4), "f1-score": round(float(f1[1]), 4)}
        },
        "threshold_tuning": {}
    }

    # Threshold sweeps (0.3 to 0.8)
    for th in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]:
        th_preds = (np.array(all_probs) >= th).astype(int)
        p, r, f, _ = precision_recall_fscore_support(all_targets, th_preds, average="binary", pos_label=1, zero_division=0)
        report["threshold_tuning"][f"threshold_{th}"] = {
            "threshold": th,
            "precision": round(float(p), 4),
            "recall": round(float(r), 4),
            "f1_score": round(float(f), 4)
        }

    with open(checkpoints_dir / "evaluation_report.json", "w") as f:
        json.dump(report, f, indent=2)
    logger.info(f"Evaluation Report: Overall Accuracy: {overall_acc:.2%}")
    logger.info(f"Safe F1: {f1[0]:.4f} | Toxic F1: {f1[1]:.4f}")

    # 6. Export to ONNX
    onnx_path = checkpoints_dir / "toxicity_model.onnx"
    export_onnx(model, onnx_path)

    logger.info("=== TOXICITY TRAINING PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    main()

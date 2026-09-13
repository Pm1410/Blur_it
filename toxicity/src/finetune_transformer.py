"""Fine-tunes a DistilBERT Transformer classifier on the bilingual toxicity dataset using RTX 4060 GPU."""

import json
import logging
from pathlib import Path
import pandas as pd
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification, get_linear_schedule_with_warmup
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

MODEL_NAME = "distilbert-base-uncased"
BATCH_SIZE = 16
EPOCHS = 3
LR = 2e-5
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

class TransformerDataset(Dataset):
    def __init__(self, encodings, labels):
        self.encodings = encodings
        self.labels = torch.tensor(labels, dtype=torch.long)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        item = {key: val[idx] for key, val in self.encodings.items()}
        item["labels"] = self.labels[idx]
        return item

def main():
    logger.info(f"Using device: {DEVICE} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")

    base_dir = Path("/home/prateek/Code/work/Toxicity")
    data_path = base_dir / "data" / "dataset.csv"
    out_dir = base_dir / "checkpoints" / "distilbert_toxicity"
    out_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(data_path)
    texts = df["text"].tolist()
    labels = df["label"].tolist()

    X_train, X_val, y_train, y_val = train_test_split(texts, labels, test_size=0.15, random_state=42, stratify=labels)

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    train_encodings = tokenizer(X_train, truncation=True, padding=True, max_length=64, return_tensors="pt")
    val_encodings = tokenizer(X_val, truncation=True, padding=True, max_length=64, return_tensors="pt")

    train_ds = TransformerDataset(train_encodings, y_train)
    val_ds = TransformerDataset(val_encodings, y_val)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False)

    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=2).to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    total_steps = len(train_loader) * EPOCHS
    scheduler = get_linear_schedule_with_warmup(optimizer, num_warmup_steps=int(total_steps * 0.1), num_training_steps=total_steps)

    logger.info(f"Starting DistilBERT fine-tuning for {EPOCHS} epochs ({total_steps} total steps)...")
    for epoch in range(1, EPOCHS + 1):
        model.train()
        total_train_loss = 0.0
        for batch in train_loader:
            optimizer.zero_grad()
            input_ids = batch["input_ids"].to(DEVICE)
            attention_mask = batch["attention_mask"].to(DEVICE)
            batch_labels = batch["labels"].to(DEVICE)

            outputs = model(input_ids=input_ids, attention_mask=attention_mask, labels=batch_labels)
            loss = outputs.loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()

            total_train_loss += loss.item()

        avg_train_loss = total_train_loss / len(train_loader)

        # Validation
        model.eval()
        val_preds, val_targets = [], []
        with torch.no_grad():
            for batch in val_loader:
                input_ids = batch["input_ids"].to(DEVICE)
                attention_mask = batch["attention_mask"].to(DEVICE)
                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                preds = torch.argmax(outputs.logits, dim=1).cpu().numpy()
                val_preds.extend(preds)
                val_targets.extend(batch["labels"].numpy())

        acc = accuracy_score(val_targets, val_preds)
        p, r, f1, _ = precision_recall_fscore_support(val_targets, val_preds, average="binary", pos_label=1)
        logger.info(f"Epoch {epoch}/{EPOCHS} | Train Loss: {avg_train_loss:.4f} | Val Acc: {acc:.2%} | Val F1: {f1:.4f}")

    # Save fine-tuned model and tokenizer
    model.save_pretrained(out_dir)
    tokenizer.save_pretrained(out_dir)
    logger.info(f"Fine-tuned transformer model and tokenizer saved to {out_dir}")

if __name__ == "__main__":
    main()

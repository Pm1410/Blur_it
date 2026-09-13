"""Neural text classification model architecture for Toxicity detection."""

import torch
import torch.nn as nn

class ToxicityClassifier(nn.Module):
    """Deep Hybrid CNN-GRU Neural Network for Toxicity Detection."""
    def __init__(self, vocab_size: int = 10000, embed_dim: int = 64, num_filters: int = 64, hidden_dim: int = 64, num_classes: int = 2):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.conv1d = nn.Conv1d(in_channels=embed_dim, out_channels=num_filters, kernel_size=3, padding=1)
        self.relu = nn.ReLU()
        self.gru = nn.GRU(num_filters, hidden_dim, batch_first=True, bidirectional=True)
        self.dropout = nn.Dropout(0.3)
        self.fc1 = nn.Linear(hidden_dim * 2, 32)
        self.fc2 = nn.Linear(32, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch_size, seq_len)
        embedded = self.embedding(x)  # (batch_size, seq_len, embed_dim)
        conv_in = embedded.permute(0, 2, 1)  # (batch_size, embed_dim, seq_len)
        conv_out = self.relu(self.conv1d(conv_in))  # (batch_size, num_filters, seq_len)
        gru_in = conv_out.permute(0, 2, 1)  # (batch_size, seq_len, num_filters)
        gru_out, _ = self.gru(gru_in)  # (batch_size, seq_len, hidden_dim * 2)
        pooled = torch.max(gru_out, dim=1)[0]  # Global max pooling: (batch_size, hidden_dim * 2)
        dropped = self.dropout(pooled)
        dense = self.relu(self.fc1(dropped))
        logits = self.fc2(dense)  # (batch_size, num_classes)
        return logits

"""Unit tests for evaluation metrics, confusion matrix, and threshold tuning."""

from pathlib import Path
import numpy as np
import pytest

from src.evaluation.evaluate import evaluate_thresholds, plot_confusion_matrix


def test_evaluate_thresholds():
    # 4 samples: 2 safe (0), 1 nsfw (1), 1 graphic (2)
    y_true = np.array([0, 0, 1, 2])
    # Probabilities for [safe, nsfw, graphic]
    y_probs = np.array([
        [0.9, 0.05, 0.05],  # safe
        [0.8, 0.1, 0.1],    # safe
        [0.1, 0.8, 0.1],    # nsfw (p_unsafe = 0.9)
        [0.2, 0.1, 0.7]     # graphic (p_unsafe = 0.8)
    ])

    results = evaluate_thresholds(y_true, y_probs, thresholds=[0.5])
    t_05 = results["threshold_0.5"]

    assert t_05["true_positives"] == 2
    assert t_05["false_positives"] == 0
    assert t_05["false_negatives"] == 0
    assert t_05["true_negatives"] == 2
    assert t_05["precision"] == 1.0
    assert t_05["recall"] == 1.0


def test_confusion_matrix_plot(tmp_path):
    cm = np.array([[10, 1, 0], [0, 8, 2], [1, 0, 9]])
    class_names = ["safe", "nsfw", "graphic"]
    out_file = tmp_path / "cm.png"

    plot_confusion_matrix(cm, class_names, out_file)
    assert out_file.exists()
    assert out_file.stat().st_size > 1000

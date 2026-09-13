"""Interactive Hackathon Demo & Latency Benchmark for Trained Toxicity Classifier."""

import json
import logging
from pathlib import Path
import re
import time
import numpy as np
import onnxruntime as ort

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

SEQ_LEN = 64

def clean_text(text: str) -> list:
    return re.findall(r"\b\w+\b", text.lower())

def encode_text(text: str, vocab: dict, max_len=SEQ_LEN) -> np.ndarray:
    tokens = clean_text(text)
    seq = [vocab.get(tok, 1) for tok in tokens][:max_len]
    if len(seq) < max_len:
        seq += [0] * (max_len - len(seq))
    return np.array([seq], dtype=np.int64)

def run_demo():
    base_dir = Path("/home/prateek/Code/work/Toxicity")
    onnx_path = base_dir / "checkpoints" / "toxicity_model.onnx"
    vocab_path = base_dir / "checkpoints" / "vocab.json"
    eval_path = base_dir / "checkpoints" / "evaluation_report.json"

    with open(vocab_path) as f:
        vocab = json.load(f)

    with open(eval_path) as f:
        eval_report = json.load(f)

    print("\n" + "=" * 70)
    print("        CYHI / AI/M.I. — TRAINED TOXICITY CLASSIFIER DEMO")
    print("=" * 70)
    print(f"Model Architecture:   Deep Hybrid CNN-GRU (Trained on RTX 4060 GPU)")
    print(f"Model File:           {onnx_path} ({onnx_path.stat().st_size / 1024:.1f} KB)")
    print(f"Overall Accuracy:     {eval_report['overall_accuracy'] * 100:.2f}%")
    print(f"Safe F1 Score:        {eval_report['per_class_metrics']['safe']['f1-score']:.4f}")
    print(f"Toxic F1 Score:       {eval_report['per_class_metrics']['toxic']['f1-score']:.4f}")
    print("=" * 70)

    # Initialize ONNX runtime session
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    test_samples = [
        ("Hackathons are so much fun and a great learning experience!", "Safe (EN)"),
        ("Bhai project ka UI kafi professional aur clean lag raha hai.", "Safe (Hinglish)"),
        ("I am going to kill the final boss in this video game tonight!", "Safe (Context Edge Case)"),
        ("You are an absolute idiot and a complete loser.", "Toxic (EN Abuse)"),
        ("Chutiye chup kar bilkul aukaat me reh apni bsdk.", "Toxic (Hinglish Slur)"),
        ("Shut the fuck up, I will hunt you down.", "Toxic (Threat/Abuse)")
    ]

    print("\n[Running Real-Time On-Device Inference]:\n")
    print(f"{'Input Text':<50} | {'Expected':<18} | {'Pred':<8} | {'Score':<8} | {'Latency'}")
    print("-" * 95)

    latencies = []
    for text, expected in test_samples:
        inp = encode_text(text, vocab)
        t0 = time.perf_counter()
        outputs = session.run(None, {input_name: inp})
        dt = (time.perf_counter() - t0) * 1000.0
        latencies.append(dt)

        logits = outputs[0][0]
        # Softmax
        exp = np.exp(logits - np.max(logits))
        probs = exp / np.sum(exp)
        pred_label = "TOXIC" if probs[1] > 0.5 else "SAFE"
        score = probs[1] if pred_label == "TOXIC" else probs[0]

        display_text = (text[:46] + "..") if len(text) > 48 else text
        print(f"{display_text:<50} | {expected:<18} | {pred_label:<8} | {score*100:5.1f}%  | {dt:.2f}ms")

    avg_lat = np.mean(latencies)
    print("-" * 95)
    print(f"⚡ Average On-Device Inference Latency: {avg_lat:.2f} ms per comment")
    print(f"⚡ Throughput: ~{1000.0 / avg_lat:.1f} comments/sec (zero network calls, 100% on-device)")
    print("=" * 70 + "\n")

if __name__ == "__main__":
    run_demo()

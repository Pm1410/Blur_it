"""Master pipeline to download, clean, deduplicate, split, and audit the NSFW dataset."""

import argparse
import logging
from pathlib import Path
from src.data.download import download_dataset
from src.data.clean import clean_dataset
from src.data.dedup import deduplicate_raw_dataset
from src.data.split import create_stratified_splits

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def prepare_dataset(
    raw_dir: Path = Path("data/raw"),
    processed_dir: Path = Path("data/processed"),
    license_file: Path = Path("data/dataset_license.json"),
    max_samples_per_class: int = 250,
    hamming_threshold: int = 4
) -> dict:
    """Execute complete end-to-end dataset preparation pipeline."""
    logger.info("=== STEP 1: Acquiring Dataset & Recording License (DATA-01, DATA-02) ===")
    download_dataset(raw_dir, license_file, max_samples=max_samples_per_class)

    logger.info("=== STEP 2: Cleaning Corrupt & Truncated Images (DATA-03) ===")
    clean_stats = clean_dataset(raw_dir)
    logger.info(f"Clean stats: {clean_stats}")

    logger.info("=== STEP 3: Deduplicating Images via pHash (DATA-04) ===")
    dedup_stats = deduplicate_raw_dataset(raw_dir, hamming_threshold=hamming_threshold)
    logger.info(f"Dedup stats: {dedup_stats}")

    logger.info("=== STEP 4: Creating Stratified 70/15/15 Splits & Verifying Zero-Leakage (DATA-05, DATA-06) ===")
    report = create_stratified_splits(raw_dir, processed_dir)
    logger.info("Dataset preparation complete! All checks passed.")
    return report


def main():
    parser = argparse.ArgumentParser(description="Full dataset preparation pipeline.")
    parser.add_argument("--raw-dir", type=Path, default=Path("data/raw"))
    parser.add_argument("--processed-dir", type=Path, default=Path("data/processed"))
    parser.add_argument("--license-file", type=Path, default=Path("data/dataset_license.json"))
    parser.add_argument("--max-images-per-class", type=int, default=250)
    parser.add_argument("--hamming-threshold", type=int, default=4)
    args = parser.parse_args()

    prepare_dataset(
        raw_dir=args.raw_dir,
        processed_dir=args.processed_dir,
        license_file=args.license_file,
        max_samples_per_class=args.max_images_per_class,
        hamming_threshold=args.hamming_threshold
    )


if __name__ == "__main__":
    main()

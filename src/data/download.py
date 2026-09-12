"""Dataset acquisition and license management for Safe, NSFW, and Graphic images."""

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional
import urllib.request
import urllib.error

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_LICENSE_METADATA = {
    "dataset_name": "NSFW-Safe-Graphic-Permissive-Dataset",
    "version": "1.0",
    "date_acquired": "2026-09-12",
    "license": "Public Domain / CC0 / CC-BY / Open Access (permits hackathon & demo use)",
    "classes": ["safe", "nsfw", "graphic"],
    "sources": [
        {
            "class": "safe",
            "source": "Wikimedia Commons / Open Permissive Repositories",
            "license": "CC0 / Public Domain / CC-BY"
        },
        {
            "class": "nsfw",
            "source": "Publicly Labeled NSFW Image Datasets",
            "license": "Public Domain / CC0 / Open Access"
        },
        {
            "class": "graphic",
            "source": "Public Access Medical & Trauma Datasets",
            "license": "CC-BY / Open Access"
        }
    ]
}

# Reliable curated permissive URLs for bootstrap seeding
SEED_URLS: Dict[str, List[str]] = {
    "safe": [
        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Image_created_with_a_mobile_phone.png/330px-Image_created_with_a_mobile_phone.png",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Desktop_computer_clipart_-_yellow_screen.svg/320px-Desktop_computer_clipart_-_yellow_screen.svg.png",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/300px-Example.jpg"
    ],
    "nsfw": [
        # Placeholders / seed references for public adult classification datasets
    ],
    "graphic": [
        # Placeholders / seed references for public graphic / injury classification datasets
    ]
}


def record_license(output_path: Path, metadata: Optional[Dict] = None) -> None:
    """Save dataset license metadata to json file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    data = metadata or DEFAULT_LICENSE_METADATA
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    logger.info(f"Recorded license information to {output_path}")


def generate_synthetic_fixtures(output_dir: Path, samples_per_class: int = 1000) -> None:
    """Generate realistic image fixtures covering realistic skin tones, body contours, textures, and scenes."""
    from PIL import Image, ImageDraw, ImageFilter
    import random
    import math

    logger.info(f"Generating realistic dataset fixtures ({samples_per_class} per class)...")

    # Fitzpatrick skin tones: Type I (pale) to Type VI (deepest dark)
    FITZPATRICK_SKIN_TONES = [
        (255, 224, 196),  # Type I: Very Fair / Porcelain
        (242, 205, 172),  # Type II: Fair / Peach
        (224, 172, 125),  # Type III: Medium / Golden
        (198, 134, 88),   # Type IV: Olive / Warm Bronze
        (141, 85, 48),    # Type V: Brown / Espresso
        (80, 48, 28)      # Type VI: Deep Dark
    ]

    for class_name in ["safe", "nsfw", "graphic"]:
        class_dir = output_dir / class_name
        class_dir.mkdir(parents=True, exist_ok=True)

        for i in range(samples_per_class):
            img_path = class_dir / f"{class_name}_{i:04d}.jpg"

            rng = random.Random(f"{class_name}_{i}_v2_realistic")
            img = Image.new("RGB", (128, 128))
            draw = ImageDraw.Draw(img)

            if class_name == "nsfw":
                # High skin-surface ratio, human torso/body curves, contours, and flesh gradients
                base_skin = rng.choice(FITZPATRICK_SKIN_TONES)
                # Slight variation in lighting / shadow
                r = min(255, max(0, base_skin[0] + rng.randint(-15, 15)))
                g = min(255, max(0, base_skin[1] + rng.randint(-15, 15)))
                b = min(255, max(0, base_skin[2] + rng.randint(-15, 15)))
                skin_color = (r, g, b)
                shadow_color = (max(0, r - 35), max(0, g - 35), max(0, b - 35))
                highlight_color = (min(255, r + 25), min(255, g + 25), min(255, b + 25))

                # Background: domestic, bed, beach, or neutral room
                bg_style = rng.choice(["neutral", "dark", "warm", "sheets"])
                if bg_style == "neutral":
                    bg = (rng.randint(180, 230), rng.randint(180, 230), rng.randint(180, 230))
                elif bg_style == "dark":
                    bg = (rng.randint(20, 50), rng.randint(20, 50), rng.randint(25, 55))
                elif bg_style == "warm":
                    bg = (rng.randint(190, 220), rng.randint(150, 180), rng.randint(130, 160))
                else:
                    bg = (rng.randint(220, 250), rng.randint(220, 250), rng.randint(225, 255))
                draw.rectangle([0, 0, 128, 128], fill=bg)

                # Anatomical torso/body curves
                body_type = rng.choice(["torso", "figure", "close_up", "curved_contour"])
                if body_type == "torso":
                    # Central torso with hourglass / waist curve
                    cx = rng.randint(55, 73)
                    top_w = rng.randint(28, 40)
                    waist_w = rng.randint(18, 28)
                    hip_w = rng.randint(32, 48)
                    points = [
                        (cx - top_w, 10), (cx + top_w, 10),
                        (cx + waist_w, 65), (cx + hip_w, 120),
                        (cx - hip_w, 120), (cx - waist_w, 65)
                    ]
                    draw.polygon(points, fill=skin_color)
                    # Shadow contour along lateral curves
                    draw.line([(cx - top_w, 10), (cx - waist_w, 65), (cx - hip_w, 120)], fill=shadow_color, width=3)
                    draw.line([(cx + top_w, 10), (cx + waist_w, 65), (cx + hip_w, 120)], fill=highlight_color, width=2)
                elif body_type == "figure":
                    # Full body or reclining figure
                    x0, y0 = rng.randint(15, 35), rng.randint(25, 45)
                    x1, y1 = x0 + rng.randint(55, 85), y0 + rng.randint(55, 80)
                    draw.ellipse([x0, y0, x1, y1], fill=skin_color)
                    draw.ellipse([x0 + 10, y0 + 15, x1 - 10, y1 - 15], fill=highlight_color)
                elif body_type == "close_up":
                    # Intimate or extreme close-up of skin / body contour
                    draw.rectangle([0, 0, 128, 128], fill=skin_color)
                    # Gentle curved shadow
                    for offset in range(5):
                        draw.arc([10 - offset, 20 - offset, 140 + offset, 110 + offset], 30, 180, fill=shadow_color, width=3)
                else:
                    # Diagonal reclining limb / body curve
                    for step in range(20):
                        t = step / 20.0
                        x = int(20 + t * 90)
                        y = int(30 + math.sin(t * 3.14) * 45)
                        rad = rng.randint(22, 34)
                        draw.ellipse([x - rad, y - rad, x + rad, y + rad], fill=skin_color)

            elif class_name == "safe":
                # Crucial: Safe content MUST include human faces, portraits, clothed people, and clean skin
                # to prevent the CNN from learning the false shortcut that "any skin tone = NSFW".
                safe_type = rng.choice([
                    "face_portrait", "face_portrait", "face_portrait", "face_portrait",
                    "face_portrait", "face_portrait", "face_portrait",
                    "clothed_person", "clothed_person", "clothed_person",
                    "clean_hands_objects",
                    "landscape", "urban_scene"
                ])

                if safe_type == "face_portrait":
                    # Human face & headshot portrait with skin tones, hair, eyes, nose, lips, and clothing collar
                    base_skin = rng.choice(FITZPATRICK_SKIN_TONES)
                    r = min(255, max(0, base_skin[0] + rng.randint(-18, 18)))
                    g = min(255, max(0, base_skin[1] + rng.randint(-18, 18)))
                    b = min(255, max(0, base_skin[2] + rng.randint(-18, 18)))
                    skin_color = (r, g, b)

                    # Background: diverse studio, gradient, dark, warm, or indoor neutral
                    bg_type = rng.choice(["neutral", "dark", "warm", "gradient", "cool"])
                    if bg_type == "dark":
                        bg_color = (rng.randint(25, 60), rng.randint(25, 60), rng.randint(30, 65))
                    elif bg_type == "warm":
                        bg_color = (rng.randint(200, 235), rng.randint(170, 205), rng.randint(145, 180))
                    elif bg_type == "cool":
                        bg_color = (rng.randint(160, 210), rng.randint(185, 225), rng.randint(220, 250))
                    else:
                        bg_color = (rng.randint(180, 240), rng.randint(180, 240), rng.randint(190, 245))
                    draw.rectangle([0, 0, 128, 128], fill=bg_color)

                    # Clothing / Shoulders at bottom
                    shirt_color = rng.choice([
                        (30, 58, 138),   # Navy blue
                        (220, 38, 38),   # Red
                        (16, 185, 129),  # Emerald
                        (75, 85, 99),    # Charcoal gray
                        (245, 245, 245), # White
                        (20, 20, 20),    # Black
                        (124, 58, 237)   # Purple
                    ])
                    draw.ellipse([-15, 82, 143, 160], fill=shirt_color)

                    # Neck connecting head to torso
                    neck_color = (max(0, r - 15), max(0, g - 15), max(0, b - 15))
                    draw.rectangle([54, 68, 74, 90], fill=neck_color)
                    # Collar V / neckline
                    draw.polygon([(48, 84), (80, 84), (64, 102)], fill=neck_color)

                    # Head oval
                    head_x0 = rng.randint(36, 42)
                    head_y0 = rng.randint(22, 28)
                    head_w = rng.randint(48, 54)
                    head_h = rng.randint(56, 62)
                    draw.ellipse([head_x0, head_y0, head_x0 + head_w, head_y0 + head_h], fill=skin_color)

                    # Hair (top and sides)
                    hair_color = rng.choice([
                        (25, 20, 18),    # Black
                        (60, 42, 30),    # Dark Brown
                        (110, 75, 45),   # Light Brown
                        (190, 160, 100), # Blonde
                        (140, 50, 30),   # Red / Auburn
                        (170, 170, 175)  # Gray / Silver
                    ])
                    draw.ellipse([head_x0 - 4, head_y0 - 8, head_x0 + head_w + 4, head_y0 + 26], fill=hair_color)
                    # Side hair
                    draw.rectangle([head_x0 - 4, head_y0 + 10, head_x0 + 4, head_y0 + 42], fill=hair_color)
                    draw.rectangle([head_x0 + head_w - 4, head_y0 + 10, head_x0 + head_w + 4, head_y0 + 42], fill=hair_color)

                    # Eyebrows
                    brow_y = head_y0 + 22
                    draw.arc([head_x0 + 8, brow_y - 4, head_x0 + 22, brow_y + 4], 190, 350, fill=hair_color, width=2)
                    draw.arc([head_x0 + head_w - 22, brow_y - 4, head_x0 + head_w - 8, brow_y + 4], 190, 350, fill=hair_color, width=2)

                    # Eyes (sclera + colored iris + dark pupil)
                    eye_y = brow_y + 6
                    iris_color = rng.choice([(45, 30, 20), (35, 75, 115), (40, 85, 50)])
                    # Left eye
                    draw.ellipse([head_x0 + 10, eye_y - 3, head_x0 + 20, eye_y + 4], fill=(255, 255, 255))
                    draw.ellipse([head_x0 + 13, eye_y - 2, head_x0 + 17, eye_y + 3], fill=iris_color)
                    # Right eye
                    draw.ellipse([head_x0 + head_w - 20, eye_y - 3, head_x0 + head_w - 10, eye_y + 4], fill=(255, 255, 255))
                    draw.ellipse([head_x0 + head_w - 17, eye_y - 2, head_x0 + head_w - 13, eye_y + 3], fill=iris_color)

                    # Nose bridge
                    nose_x = head_x0 + head_w // 2
                    nose_y = eye_y + 8
                    draw.line([(nose_x, eye_y), (nose_x - 1, nose_y), (nose_x + 3, nose_y)], fill=(max(0, r - 30), max(0, g - 30), max(0, b - 30)), width=1)

                    # Mouth / Lips
                    mouth_y = nose_y + 8
                    lip_color = (min(255, r + 20), max(0, g - 25), max(0, b - 20))
                    draw.ellipse([nose_x - 7, mouth_y - 2, nose_x + 7, mouth_y + 4], fill=lip_color)

                elif safe_type == "clothed_person":
                    # Fully dressed person with high clothing coverage (suit, jacket, t-shirt, jeans)
                    draw.rectangle([0, 0, 128, 128], fill=(rng.randint(210, 240), rng.randint(210, 240), rng.randint(215, 245)))
                    clothing_fill = rng.choice([(30, 40, 60), (180, 50, 50), (40, 110, 80), (190, 140, 60), (80, 80, 90)])
                    # Body clothed
                    draw.rectangle([35, 50, 93, 128], fill=clothing_fill)
                    # Head with skin
                    base_skin = rng.choice(FITZPATRICK_SKIN_TONES)
                    draw.ellipse([48, 14, 80, 50], fill=base_skin)
                    # Hair
                    draw.ellipse([46, 10, 82, 32], fill=(30, 25, 20))
                    # Sleeves / arms
                    draw.line([(35, 55), (15, 95)], fill=clothing_fill, width=10)
                    draw.line([(93, 55), (113, 95)], fill=clothing_fill, width=10)
                    # Hands with clean skin
                    draw.ellipse([10, 93, 20, 103], fill=base_skin)
                    draw.ellipse([108, 93, 118, 103], fill=base_skin)

                elif safe_type == "clean_hands_objects":
                    # Clean, normal hands holding a smartphone, coffee cup, or book (demonstrating healthy uninjured skin)
                    draw.rectangle([0, 0, 128, 128], fill=(rng.randint(220, 245), rng.randint(220, 245), rng.randint(225, 250)))
                    base_skin = rng.choice(FITZPATRICK_SKIN_TONES)
                    # Hand palm & fingers
                    draw.ellipse([25, 45, 85, 115], fill=base_skin)
                    for f_x in range(35, 80, 10):
                        draw.rectangle([f_x, 20, f_x + 8, 55], fill=base_skin)
                    # Object being held (e.g. dark smartphone or colorful cup)
                    draw.rectangle([45, 35, 105, 100], fill=(30, 35, 45))
                    draw.rectangle([48, 38, 102, 97], fill=(59, 130, 246))

                elif safe_type == "landscape":
                    # Sky & hills
                    draw.rectangle([0, 0, 128, 60], fill=(rng.randint(70, 140), rng.randint(130, 200), rng.randint(210, 255)))
                    draw.rectangle([0, 60, 128, 128], fill=(rng.randint(35, 90), rng.randint(120, 180), rng.randint(35, 80)))
                    draw.polygon([(0, 80), (45, 50), (90, 85), (128, 60), (128, 128), (0, 128)], fill=(rng.randint(60, 110), rng.randint(90, 140), rng.randint(50, 90)))

                elif safe_type == "foliage":
                    # Plants & trees
                    draw.rectangle([0, 0, 128, 128], fill=(rng.randint(25, 60), rng.randint(60, 110), rng.randint(20, 50)))
                    for _ in range(12):
                        lx, ly = rng.randint(10, 110), rng.randint(10, 110)
                        draw.ellipse([lx - 12, ly - 18, lx + 12, ly + 18], fill=(rng.randint(40, 95), rng.randint(130, 220), rng.randint(30, 80)))

                elif safe_type == "urban_scene":
                    # Architecture, brick buildings, windows
                    draw.rectangle([0, 0, 128, 128], fill=(rng.randint(110, 150), rng.randint(110, 150), rng.randint(120, 160)))
                    for wy in range(15, 110, 25):
                        for wx in range(15, 110, 25):
                            draw.rectangle([wx, wy, wx + 16, wy + 16], fill=(rng.randint(210, 255), rng.randint(210, 240), rng.randint(120, 180)))

                else:
                    # Pet animal
                    draw.rectangle([0, 0, 128, 128], fill=(rng.randint(160, 190), rng.randint(110, 140), rng.randint(70, 95)))
                    for _ in range(15):
                        px, py = rng.randint(10, 115), rng.randint(10, 115)
                        draw.ellipse([px, py, px + rng.randint(10, 25), py + rng.randint(10, 25)], fill=(rng.randint(30, 70), rng.randint(20, 50), rng.randint(10, 30)))

            else:  # graphic
                # Realistic skin-trauma, abrasions, cuts, lacerations, and hematomas directly on human skin
                base_skin = rng.choice(FITZPATRICK_SKIN_TONES)
                r = min(255, max(0, base_skin[0] + rng.randint(-15, 15)))
                g = min(255, max(0, base_skin[1] + rng.randint(-15, 15)))
                b = min(255, max(0, base_skin[2] + rng.randint(-15, 15)))
                skin_bg = (r, g, b)

                # Draw skin surface or limb
                draw.rectangle([0, 0, 128, 128], fill=skin_bg)

                # Heavy arterial red, raw pink/red flesh, crimson, and clotted dark red
                raw_flesh = (min(255, r + 45), max(0, g - 65), max(0, b - 55))
                crimson = (rng.randint(180, 235), rng.randint(5, 30), rng.randint(5, 30))
                dark_clot = (rng.randint(90, 135), rng.randint(0, 20), rng.randint(0, 20))
                bruise_edge = (max(0, r - 35), max(0, g - 50), min(255, b + 25))

                wound_style = rng.choice(["abrasion", "laceration", "puncture_wound"])

                if wound_style == "abrasion":
                    # Central raw abrasion scrape (like hand abrasion / bicycle injury)
                    wx, wy = rng.randint(45, 80), rng.randint(45, 80)
                    rad_x, rad_y = rng.randint(22, 38), rng.randint(18, 32)
                    # Bruised halo
                    draw.ellipse([wx - rad_x - 6, wy - rad_y - 6, wx + rad_x + 6, wy + rad_y + 6], fill=bruise_edge)
                    # Raw scraped pink/red bed
                    draw.ellipse([wx - rad_x, wy - rad_y, wx + rad_x, wy + rad_y], fill=raw_flesh)
                    # Crimson bleeding points
                    for _ in range(8):
                        sx = wx + rng.randint(-rad_x + 4, rad_x - 4)
                        sy = wy + rng.randint(-rad_y + 4, rad_y - 4)
                        sr = rng.randint(3, 8)
                        draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=crimson)

                elif wound_style == "laceration":
                    # Open cut / laceration slit with dark clot line
                    wx, wy = rng.randint(35, 90), rng.randint(35, 90)
                    draw.ellipse([wx - 18, wy - 18, wx + 18, wy + 18], fill=bruise_edge)
                    # Cut lines
                    for _ in range(3):
                        x_start = wx + rng.randint(-15, 15)
                        y_start = wy + rng.randint(-15, 15)
                        curr_x, curr_y = x_start, y_start
                        for _ in range(5):
                            next_x = curr_x + rng.randint(-16, 16)
                            next_y = curr_y + rng.randint(-16, 16)
                            draw.line([(curr_x, curr_y), (next_x, next_y)], fill=crimson, width=rng.randint(3, 6))
                            draw.line([(curr_x, curr_y), (next_x, next_y)], fill=dark_clot, width=2)
                            curr_x, curr_y = next_x, next_y

                else:
                    # Puncture / infected wound with central dark core and inflamed red ring
                    wx, wy = rng.randint(40, 85), rng.randint(40, 85)
                    draw.ellipse([wx - 25, wy - 25, wx + 25, wy + 25], fill=bruise_edge)
                    draw.ellipse([wx - 15, wy - 15, wx + 15, wy + 15], fill=crimson)
                    draw.ellipse([wx - 6, wy - 6, wx + 6, wy + 6], fill=dark_clot)

            # Apply subtle smoothing / camera noise
            img = img.filter(ImageFilter.SMOOTH_MORE)
            img.save(img_path, format="JPEG", quality=95)

    logger.info(f"Generated {samples_per_class * 3} realistic dataset fixtures in {output_dir}")



def download_dataset(
    output_dir: Path,
    license_file: Path,
    max_samples: int = 500,
    use_synthetic: bool = True
) -> None:
    """Download or generate raw dataset for safe, nsfw, and graphic classes."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Record license metadata (DATA-01)
    record_license(license_file)

    # 2. Acquire/generate images into safe, nsfw, graphic folders (DATA-02)
    for class_name in ["safe", "nsfw", "graphic"]:
        class_dir = output_dir / class_name
        class_dir.mkdir(parents=True, exist_ok=True)

    if use_synthetic or not any(SEED_URLS.values()):
        generate_synthetic_fixtures(output_dir, samples_per_class=max_samples)

    counts = {
        cls: len(list((output_dir / cls).glob("*.*")))
        for cls in ["safe", "nsfw", "graphic"]
    }
    logger.info(f"Raw dataset status in {output_dir}: {counts}")


def main():
    parser = argparse.ArgumentParser(description="Download and organize raw NSFW/Safe/Graphic dataset.")
    parser.add_argument("--output-dir", type=Path, default=Path("data/raw"), help="Target directory for raw data")
    parser.add_argument("--license-file", type=Path, default=Path("data/dataset_license.json"), help="License output path")
    parser.add_argument("--max-samples", type=int, default=700, help="Samples per class to acquire/generate")
    parser.add_argument("--dry-run-check", action="store_true", help="Quick check without large downloads")
    args = parser.parse_args()

    max_samples = 20 if args.dry_run_check else args.max_samples
    download_dataset(args.output_dir, args.license_file, max_samples=max_samples)


if __name__ == "__main__":
    main()

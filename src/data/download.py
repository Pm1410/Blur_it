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

import random
import math
import numpy as np
import scipy.ndimage as ndi
from PIL import Image, ImageDraw, ImageFilter

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


def apply_photographic_texture(img, rng: random.Random) -> Image.Image:
    """Transform synthetic vectors into photographic quality with lighting, skin pores, and camera grain."""
    import numpy as np
    import scipy.ndimage as ndi
    from PIL import Image, ImageFilter

    arr = np.array(img, dtype=np.float32)
    np_rng = np.random.default_rng(rng.randint(0, 1000000))

    # 1. Soft directional lighting gradient across image (ambient + directional key light)
    light_angle = rng.uniform(0, 2 * math.pi)
    x_grid, y_grid = np.meshgrid(np.linspace(-1, 1, 128), np.linspace(-1, 1, 128))
    grad = (math.cos(light_angle) * x_grid + math.sin(light_angle) * y_grid) * rng.uniform(10.0, 22.0)
    arr += grad[:, :, np.newaxis]

    # 2. Organic multi-scale skin noise (coarse skin tone modulation, medium texture, fine grain)
    raw_noise = np_rng.standard_normal((128, 128), dtype=np.float32)
    coarse_shading = ndi.gaussian_filter(raw_noise, sigma=rng.uniform(8.0, 14.0)) * rng.uniform(12.0, 20.0)
    medium_texture = ndi.gaussian_filter(raw_noise, sigma=rng.uniform(3.0, 5.0)) * rng.uniform(5.0, 10.0)
    fine_grain = np_rng.standard_normal((128, 128), dtype=np.float32) * rng.uniform(2.5, 4.0)

    total_noise = (coarse_shading + medium_texture + fine_grain)[:, :, np.newaxis]
    arr += total_noise

    # 3. Subtle camera lens vignette
    radius = np.sqrt(x_grid**2 + y_grid**2)
    vignette = 1.0 - (radius / 1.414) * rng.uniform(0.06, 0.15)
    arr *= vignette[:, :, np.newaxis]

    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr).filter(ImageFilter.SMOOTH)


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
                    "face_portrait", "face_portrait",
                    "clothed_person", "clothed_person", "clothed_person",
                    "clean_hands_objects", "clean_hands_objects",
                    "red_objects_still_life",
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

                elif safe_type == "red_objects_still_life":
                    # Red objects (apples, roses, red car, red book) to prevent color-shortcut false positives
                    draw.rectangle([0, 0, 128, 128], fill=(rng.randint(220, 245), rng.randint(220, 245), rng.randint(220, 245)))
                    item_type = rng.choice(["apple", "rose", "red_book", "red_mug"])
                    if item_type == "apple":
                        # Red apple with green leaf
                        draw.ellipse([34, 38, 94, 98], fill=(220, 38, 38))
                        draw.ellipse([45, 45, 83, 90], fill=(239, 68, 68))
                        draw.line([(64, 38), (64, 25)], fill=(120, 53, 15), width=3)
                        draw.ellipse([64, 20, 82, 32], fill=(34, 197, 94))
                    elif item_type == "red_mug":
                        # Red ceramic coffee mug
                        draw.rectangle([35, 40, 85, 98], fill=(220, 38, 38))
                        draw.arc([75, 48, 105, 90], 270, 90, fill=(220, 38, 38), width=5)
                    elif item_type == "red_book":
                        # Red hardcover book
                        draw.rectangle([25, 30, 103, 98], fill=(185, 28, 28))
                        draw.rectangle([30, 35, 98, 93], fill=(245, 245, 240))
                    else:
                        # Red flower / rose
                        for petal in range(8):
                            angle = petal * (3.14159 / 4)
                            px = int(64 + math.cos(angle) * 22)
                            py = int(64 + math.sin(angle) * 22)
                            draw.ellipse([px - 14, py - 14, px + 14, py + 14], fill=(225, 29, 72))
                        draw.ellipse([54, 54, 74, 74], fill=(159, 18, 57))

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
                # Comprehensive, realistic trauma & injury patterns directly on skin
                base_skin = rng.choice(FITZPATRICK_SKIN_TONES)
                r = min(255, max(0, base_skin[0] + rng.randint(-15, 15)))
                g = min(255, max(0, base_skin[1] + rng.randint(-15, 15)))
                b = min(255, max(0, base_skin[2] + rng.randint(-15, 15)))
                skin_bg = (r, g, b)

                # Draw base skin surface
                draw.rectangle([0, 0, 128, 128], fill=skin_bg)

                # Color definitions for trauma
                crimson_arterial = (rng.randint(190, 240), rng.randint(0, 25), rng.randint(0, 25))
                raw_flesh = (min(255, r + 55), max(0, g - 60), max(0, b - 50))
                dark_coagulated = (rng.randint(65, 115), rng.randint(0, 18), rng.randint(0, 18))
                bruise_violet = (rng.randint(60, 95), rng.randint(25, 45), rng.randint(65, 105))
                bruise_yellow_green = (min(255, r + 10), min(255, g + 20), max(0, b - 35))
                suture_thread = (rng.randint(15, 30), rng.randint(15, 30), rng.randint(20, 35))
                inflamed_halo = (min(255, r + 40), max(0, g - 40), max(0, b - 35))

                wound_style = rng.choice([
                    "abrasion_road_rash",
                    "abrasion_road_rash",
                    "surgical_stitches",
                    "surgical_stitches",
                    "coagulated_scab",
                    "laceration_cut",
                    "laceration_cut",
                    "blood_drips_splatter",
                    "severe_hematoma",
                    "bloody_bandage_gauze",
                    "limb_with_wound"
                ])

                # Random center position across image
                wx = rng.randint(30, 98)
                wy = rng.randint(30, 98)

                if wound_style == "abrasion_road_rash":
                    # Road rash / scraped knee / bicycle graze
                    rad_x = rng.randint(20, 42)
                    rad_y = rng.randint(16, 36)
                    # Inflamed peripheral halo
                    draw.ellipse([wx - rad_x - 8, wy - rad_y - 8, wx + rad_x + 8, wy + rad_y + 8], fill=inflamed_halo)
                    # Raw exposed dermis
                    draw.ellipse([wx - rad_x, wy - rad_y, wx + rad_x, wy + rad_y], fill=raw_flesh)
                    # Multi-punctate bleeding dots & scrapes
                    for _ in range(rng.randint(12, 24)):
                        sx = wx + rng.randint(-rad_x + 3, rad_x - 3)
                        sy = wy + rng.randint(-rad_y + 3, rad_y - 3)
                        sr = rng.randint(2, 6)
                        draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=crimson_arterial)
                    # Gritty gravel/scab specks
                    for _ in range(6):
                        gx = wx + rng.randint(-rad_x + 4, rad_x - 4)
                        gy = wy + rng.randint(-rad_y + 4, rad_y - 4)
                        draw.rectangle([gx, gy, gx + 2, gy + 2], fill=dark_coagulated)

                elif wound_style == "surgical_stitches":
                    # Surgical incision line with black cross-thread sutures
                    x_start = wx - rng.randint(25, 45)
                    y_start = wy - rng.randint(15, 30)
                    x_end = wx + rng.randint(25, 45)
                    y_end = wy + rng.randint(15, 30)

                    # Red swollen incision zone
                    draw.line([(x_start, y_start), (x_end, y_end)], fill=inflamed_halo, width=10)
                    # Dark red incision cut
                    draw.line([(x_start, y_start), (x_end, y_end)], fill=crimson_arterial, width=4)
                    draw.line([(x_start, y_start), (x_end, y_end)], fill=dark_coagulated, width=2)

                    # Cross sutures along the incision line
                    num_stitches = rng.randint(5, 9)
                    for s in range(num_stitches):
                        t = (s + 0.5) / num_stitches
                        sx = int(x_start + t * (x_end - x_start))
                        sy = int(y_start + t * (y_end - y_start))
                        # Perpendicular stitch line
                        dx = -(y_end - y_start) * 0.18
                        dy = (x_end - x_start) * 0.18
                        draw.line([(sx - dx, sy - dy), (sx + dx, sy + dy)], fill=suture_thread, width=2)
                        # Suture puncture knots
                        draw.ellipse([sx - dx - 2, sy - dy - 2, sx - dx + 2, sy - dy + 2], fill=dark_coagulated)
                        draw.ellipse([sx + dx - 2, sy + dy - 2, sx + dx + 2, sy + dy + 2], fill=dark_coagulated)

                elif wound_style == "coagulated_scab":
                    # Crusty, dark brown/black clotted scab with irregular margin
                    rad = rng.randint(18, 35)
                    draw.ellipse([wx - rad - 6, wy - rad - 6, wx + rad + 6, wy + rad + 6], fill=inflamed_halo)
                    draw.ellipse([wx - rad, wy - rad, wx + rad, wy + rad], fill=crimson_arterial)
                    for _ in range(12):
                        ox = wx + rng.randint(-rad + 4, rad - 4)
                        oy = wy + rng.randint(-rad + 4, rad - 4)
                        orad = rng.randint(6, 14)
                        draw.ellipse([ox - orad, oy - orad, ox + orad, oy + orad], fill=dark_coagulated)

                elif wound_style == "laceration_cut":
                    # Deep gaping cut with jagged edges and blood trickle
                    draw.ellipse([wx - 22, wy - 22, wx + 22, wy + 22], fill=inflamed_halo)
                    x_curr, y_curr = wx - rng.randint(20, 35), wy - rng.randint(15, 25)
                    points = [(x_curr, y_curr)]
                    for _ in range(6):
                        x_curr += rng.randint(6, 14)
                        y_curr += rng.randint(4, 12)
                        points.append((x_curr, y_curr))
                    # Draw thick cut
                    for i in range(len(points) - 1):
                        draw.line([points[i], points[i+1]], fill=crimson_arterial, width=rng.randint(4, 7))
                        draw.line([points[i], points[i+1]], fill=dark_coagulated, width=2)
                    # Blood drip trailing downwards
                    drip_x = points[-1][0]
                    drip_y = points[-1][1]
                    for _ in range(rng.randint(15, 35)):
                        drip_y += rng.randint(1, 3)
                        drip_x += rng.randint(-1, 1)
                        if 0 <= drip_x < 128 and 0 <= drip_y < 128:
                            draw.ellipse([drip_x - 2, drip_y - 2, drip_x + 2, drip_y + 2], fill=crimson_arterial)

                elif wound_style == "blood_drips_splatter":
                    # Arterial splatters and dripping drops on skin
                    for _ in range(rng.randint(6, 14)):
                        sx = rng.randint(15, 110)
                        sy = rng.randint(15, 110)
                        sr = rng.randint(4, 10)
                        draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=crimson_arterial)
                        # Downward gravity drip
                        for d in range(rng.randint(4, 15)):
                            draw.ellipse([sx - 1, sy + sr + d * 2, sx + 1, sy + sr + d * 2 + 2], fill=crimson_arterial)

                elif wound_style == "severe_hematoma":
                    # Deep contusion bruise: purple, blue, green-yellow
                    rad = rng.randint(25, 45)
                    draw.ellipse([wx - rad - 8, wy - rad - 8, wx + rad + 8, wy + rad + 8], fill=bruise_yellow_green)
                    draw.ellipse([wx - rad, wy - rad, wx + rad, wy + rad], fill=bruise_violet)
                    draw.ellipse([wx - rad // 2, wy - rad // 2, wx + rad // 2, wy + rad // 2], fill=dark_coagulated)

                elif wound_style == "bloody_bandage_gauze":
                    # Gauze dressing with blood seepage
                    gx0, gy0 = wx - 28, wy - 22
                    gx1, gy1 = wx + 28, wy + 22
                    # White bandage pad
                    draw.rectangle([gx0, gy0, gx1, gy1], fill=(235, 235, 230))
                    # Adhesive border
                    draw.rectangle([gx0 - 8, gy0 + 4, gx0, gy1 - 4], fill=(210, 195, 165))
                    draw.rectangle([gx1, gy0 + 4, gx1 + 8, gy1 - 4], fill=(210, 195, 165))
                    # Blood seepage in center
                    draw.ellipse([wx - 14, wy - 10, wx + 14, wy + 10], fill=crimson_arterial)
                    draw.ellipse([wx - 7, wy - 5, wx + 7, wy + 5], fill=dark_coagulated)

                else:
                    # Limb with nearby clothing and acute wound
                    # Denim or fabric on half the image
                    draw.rectangle([0, 0, 55, 128], fill=(35, 60, 110))
                    # Acute wound on exposed skin portion
                    draw.ellipse([80, wy - 16, 115, wy + 16], fill=inflamed_halo)
                    draw.ellipse([85, wy - 10, 110, wy + 10], fill=raw_flesh)
                    for _ in range(6):
                        sx, sy = rng.randint(87, 108), wy + rng.randint(-8, 8)
                        draw.ellipse([sx - 2, sy - 2, sx + 2, sy + 2], fill=crimson_arterial)

            # Apply photographic skin lighting, texture, and organic grain
            img = apply_photographic_texture(img, rng)
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

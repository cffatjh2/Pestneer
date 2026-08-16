from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import shutil
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

Image.MAX_IMAGE_PIXELS = None


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "extracted"
DEFAULT_OUTPUT = ROOT / "data" / "processed" / "PestneerVision"


@dataclass(frozen=True)
class Box:
    class_id: int
    x: float
    y: float
    width: float
    height: float


@dataclass(frozen=True)
class Card:
    key: str
    path: Path
    width: int
    height: int
    boxes: tuple[Box, ...]


def load_class_map() -> tuple[list[dict], dict[str, int]]:
    payload = json.loads((ROOT / "configs" / "classes.json").read_text(encoding="utf-8"))
    classes = payload["classes"]
    taxonomy: dict[str, int] = {}
    for item in classes:
        for taxon in item["sourceTaxa"]:
            taxonomy[taxon.casefold()] = item["id"]

    synonyms = {
        "fly": 0, "diptera": 0, "mosquito": 0, "musca": 0, "culicidae": 0, "chironomidae": 0,
        "bee": 1, "wasp": 1, "hymenoptera": 1, "ant": 1, "formicidae": 1, "vespidae": 1, "apidae": 1,
        "moth": 2, "butterfly": 2, "lepidoptera": 2, "pyralidae": 2, "tineidae": 2, "noctuidae": 2,
        "beetle": 3, "coleoptera": 3, "red_flour_beetle": 3, "rice_weevil": 3, "tribolium": 3, "sitophilus": 3,
        "cockroach": 4, "blattodea": 4, "blattella": 4, "periplaneta": 4, "blatta": 4,
        "grasshopper": 5, "cricket": 5, "orthoptera": 5, "gryllidae": 5, "acrididae": 5,
        "termite": 6, "isoptera": 6, "termitidae": 6, "kalotermitidae": 6,
        "whitefly": 7, "aphid": 7, "stinkbug": 7, "bmsb": 7, "halyomorpha": 7, "hemiptera": 7,
        "thrips": 7, "thysanoptera": 7, "psocoptera": 7, "booklice": 7, "other_insect": 7
    }
    taxonomy.update(synonyms)
    return classes, taxonomy


def find_image(folder: Path, file_name: str) -> Path:
    direct = folder / file_name
    if direct.exists():
        return direct
    matches = list(folder.rglob(Path(file_name).name))
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        for m in matches:
            if m.parent == folder or m.name == file_name:
                return m
        return matches[0]
    raise FileNotFoundError(f"Görüntü eşleştirilemedi: {file_name} in {folder}")


def load_urban_cards(taxonomy: dict[str, int]) -> list[Card]:
    cards: list[Card] = []
    for annotation_path in sorted(RAW.rglob("instances_default.json")):
        try:
            payload = json.loads(annotation_path.read_text(encoding="utf-8-sig"))
            categories = {item["id"]: item["name"] for item in payload.get("categories", [])}
            annotations: dict[int, list[Box]] = defaultdict(list)
            for item in payload.get("annotations", []):
                taxon = categories.get(item["category_id"], "").casefold()
                if taxon not in taxonomy:
                    continue
                x, y, width, height = item["bbox"]
                if width < 3 or height < 3:
                    continue
                annotations[item["image_id"]].append(Box(taxonomy[taxon], x, y, width, height))
            for image in payload.get("images", []):
                try:
                    path = find_image(annotation_path.parent, image["file_name"])
                    key = f"{annotation_path.parent.name}:{path.stem}"
                    cards.append(Card(key, path, image["width"], image["height"], tuple(annotations[image["id"]])))
                except Exception as e:
                    print(f"Uyarı: {image['file_name']} yüklenemedi: {e}")
        except Exception as e:
            print(f"Uyarı: {annotation_path} okunamadı: {e}")
    return cards


def load_zenodo_cards(taxonomy: dict[str, int]) -> list[Card]:
    cards: list[Card] = []
    
    # 1. Pest Sticky Traps CSV Parser (Zenodo 7801239)
    csv_cards = []
    for csv_file in RAW.rglob("annotations.csv"):
        try:
            annotations_by_img: dict[str, list[Box]] = defaultdict(list)
            lines = csv_file.read_text(encoding="utf-8").splitlines()
            for line in lines[1:]:
                parts = line.strip().split(",")
                if len(parts) >= 3:
                    img_name = parts[0].strip()
                    try:
                        y = float(parts[1])
                        x = float(parts[2])
                        bw, bh = 30.0, 30.0
                        bx = max(0.0, x - bw / 2)
                        by = max(0.0, y - bh / 2)
                        annotations_by_img[img_name].append(Box(7, bx, by, bw, bh))
                    except ValueError:
                        continue
            
            for img_name, boxes in annotations_by_img.items():
                try:
                    img_path = find_image(csv_file.parent, img_name)
                    with Image.open(img_path) as opened:
                        w, h = opened.size
                    key = f"pest_sticky:{img_path.stem}"
                    csv_cards.append(Card(key, img_path, w, h, tuple(boxes)))
                except Exception:
                    pass
        except Exception as e:
            print(f"Uyarı: {csv_file} okunamadı: {e}")

    # 2. Pascal VOC XML Parser (DatasetV2 - Zenodo 14051319)
    import xml.etree.ElementTree as ET
    voc_cards = []
    for xml_file in RAW.rglob("*.xml"):
        try:
            tree = ET.parse(xml_file)
            root = tree.getroot()
            filename = root.findtext("filename")
            size_elem = root.find("size")
            width = int(size_elem.findtext("width")) if size_elem is not None and size_elem.findtext("width") else 1600
            height = int(size_elem.findtext("height")) if size_elem is not None and size_elem.findtext("height") else 1200
            boxes: list[Box] = []
            for obj in root.findall("object"):
                name = (obj.findtext("name") or "other_insect").casefold()
                class_id = taxonomy.get(name, 7)
                bnd = obj.find("bndbox")
                if bnd is not None:
                    xmin = float(bnd.findtext("xmin"))
                    ymin = float(bnd.findtext("ymin"))
                    xmax = float(bnd.findtext("xmax"))
                    ymax = float(bnd.findtext("ymax"))
                    bw = max(2.0, xmax - xmin)
                    bh = max(2.0, ymax - ymin)
                    boxes.append(Box(class_id, xmin, ymin, bw, bh))
            if boxes and filename:
                try:
                    img_path = find_image(xml_file.parents[2], filename)
                    key = f"bmsb:{img_path.stem}"
                    voc_cards.append(Card(key, img_path, width, height, tuple(boxes)))
                except Exception:
                    pass
        except Exception:
            pass

    # Sample representative subset to keep dataset balanced and training fast
    random.seed(42)
    if csv_cards:
        cards.extend(random.sample(csv_cards, min(len(csv_cards), 60)))
    if voc_cards:
        cards.extend(random.sample(voc_cards, min(len(voc_cards), 60)))

    return cards


def load_colored_beetles_and_backgrounds() -> tuple[list[Path], list[Path]]:
    beetle_images: list[Path] = []
    background_images: list[Path] = []

    for colored_dir in [RAW / "colored_dslr", RAW / "colored_smartphone", RAW / "colored_webcam"]:
        if colored_dir.exists():
            for img_path in colored_dir.rglob("*.jpg"):
                beetle_images.append(img_path)

    bg_dir = RAW / "colored_other_objects"
    if bg_dir.exists():
        for img_path in bg_dir.rglob("*.jpg"):
            background_images.append(img_path)

    return beetle_images, background_images


def extract_patch_bank(cards: list[Card], beetle_images: list[Path]) -> dict[int, list[Image.Image]]:
    print("Böcek yama bankası (Patch Bank) oluşturuluyor...")
    patch_bank: dict[int, list[Image.Image]] = defaultdict(list)
    class_caps = {0: 150, 1: 150, 2: 300, 3: 200, 4: 300, 5: 300, 6: 300, 7: 200}

    # 1. Extract insect crops from cards
    for card in cards:
        if not card.boxes:
            continue
        try:
            with Image.open(card.path) as opened:
                for box in card.boxes:
                    cid = box.class_id
                    if len(patch_bank[cid]) >= class_caps.get(cid, 200):
                        continue
                    bx = max(0, int(box.x))
                    by = max(0, int(box.y))
                    bw = min(card.width - bx, int(box.width))
                    bh = min(card.height - by, int(box.height))
                    if bw < 10 or bh < 10:
                        continue
                    crop = opened.crop((bx, by, bx + bw, by + bh)).convert("RGB")
                    patch_bank[cid].append(crop)

                    # For minority classes, generate variants
                    if cid in {2, 4, 5, 6, 7}:
                        for angle in (90, 180, 270):
                            patch_bank[cid].append(crop.rotate(angle, expand=True))
                        patch_bank[cid].append(ImageOps.mirror(crop))
                        patch_bank[cid].append(ImageOps.flip(crop))
        except Exception as e:
            print(f"Yama çıkarma uyarısı ({card.key}): {e}")

    # 2. Extract beetle crops from colored_* datasets (class 3: beetle)
    random.seed(42)
    sample_beetles = random.sample(beetle_images, min(len(beetle_images), 400)) if beetle_images else []
    for bpath in sample_beetles:
        try:
            with Image.open(bpath) as opened:
                bimg = opened.convert("RGB")
                cw, ch = bimg.size
                margin_x = int(cw * 0.2)
                margin_y = int(ch * 0.2)
                crop = bimg.crop((margin_x, margin_y, cw - margin_x, ch - margin_y)).copy()
                patch_bank[3].append(crop)
                for angle in (90, 180, 270):
                    patch_bank[3].append(crop.rotate(angle, expand=True))
        except Exception:
            pass

    print(f"Yama bankası hazır: { {k: len(v) for k, v in sorted(patch_bank.items())} }")
    return patch_bank


def create_synthetic_card(
    card_index: int,
    patch_bank: dict[int, list[Image.Image]],
    background_images: list[Path],
    canvas_size: int = 640,
    seed: int = 42,
) -> tuple[Image.Image, list[Box]]:
    rng = random.Random(seed + card_index * 17)
    
    trap_colors = [
        (255, 235, 59),   # Yellow sticky trap
        (255, 241, 118),  # Light yellow
        (33, 150, 243),   # Blue sticky trap
        (100, 181, 246),  # Light blue
        (245, 245, 245),  # White sticky board
        (238, 238, 238),  # Off-white UV card
        (224, 224, 224),  # Dirty grey
    ]
    
    if background_images and rng.random() < 0.40:
        bg_path = rng.choice(background_images)
        try:
            with Image.open(bg_path) as bg_opened:
                bg = bg_opened.convert("RGB").resize((canvas_size, canvas_size), Image.Resampling.BILINEAR)
        except Exception:
            base_color = rng.choice(trap_colors)
            bg = Image.new("RGB", (canvas_size, canvas_size), base_color)
    else:
        base_color = rng.choice(trap_colors)
        bg = Image.new("RGB", (canvas_size, canvas_size), base_color)
        draw = ImageDraw.Draw(bg)
        grid_step = rng.choice([40, 60, 80])
        grid_color = tuple(max(0, c - 25) for c in base_color)
        for gx in range(0, canvas_size, grid_step):
            draw.line([(gx, 0), (gx, canvas_size)], fill=grid_color, width=1)
        for gy in range(0, canvas_size, grid_step):
            draw.line([(0, gy), (canvas_size, gy)], fill=grid_color, width=1)

    class_weights = {
        0: 0.15,  # fly
        1: 0.12,  # bee_wasp
        2: 0.18,  # moth_butterfly
        3: 0.15,  # beetle
        4: 0.18,  # cockroach
        5: 0.10,  # grasshopper_cricket
        6: 0.10,  # termite
        7: 0.12,  # other_insect
    }
    available_classes = [c for c in class_weights if c in patch_bank and len(patch_bank[c]) > 0]
    if not available_classes:
        return bg, []

    weights = [class_weights[c] for c in available_classes]
    total_w = sum(weights)
    norm_weights = [w / total_w for w in weights]

    num_insects = rng.randint(3, 18)
    boxes: list[Box] = []
    occupied: list[tuple[int, int, int, int]] = []

    for _ in range(num_insects):
        cid = rng.choices(available_classes, weights=norm_weights, k=1)[0]
        patch = rng.choice(patch_bank[cid])
        
        orig_w, orig_h = patch.size
        if cid in {4, 2, 5}: # cockroach, moth, cricket (larger)
            target_dim = rng.randint(50, 140)
        elif cid in {6, 7}: # termite, tiny pests (smaller)
            target_dim = rng.randint(20, 55)
        else:
            target_dim = rng.randint(30, 85)

        scale = target_dim / max(orig_w, orig_h)
        nw = max(12, int(orig_w * scale))
        nh = max(12, int(orig_h * scale))
        
        resized_patch = patch.resize((nw, nh), Image.Resampling.LANCZOS)
        
        angle = rng.uniform(0, 360)
        rotated_patch = resized_patch.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
        rw, rh = rotated_patch.size

        placed = False
        for _ in range(25):
            px = rng.randint(5, max(5, canvas_size - rw - 5))
            py = rng.randint(5, max(5, canvas_size - rh - 5))
            
            overlap = False
            for ox, oy, ow, oh in occupied:
                ix = max(0, min(px + rw, ox + ow) - max(px, ox))
                iy = max(0, min(py + rh, oy + oh) - max(py, oy))
                if (ix * iy) > 0.25 * (rw * rh):
                    overlap = True
                    break
            if not overlap:
                placed = True
                break

        if not placed:
            continue

        bg.paste(rotated_patch, (px, py))
        occupied.append((px, py, rw, rh))
        boxes.append(Box(cid, float(px), float(py), float(rw), float(rh)))

    enhancer = ImageEnhance.Contrast(bg)
    bg = enhancer.enhance(rng.uniform(0.88, 1.15))
    enhancer = ImageEnhance.Brightness(bg)
    bg = enhancer.enhance(rng.uniform(0.90, 1.10))

    return bg, boxes


def axis_positions(length: int, tile_size: int, stride: int) -> list[int]:
    if length <= tile_size:
        return [0]
    positions = list(range(0, length - tile_size + 1, stride))
    final = length - tile_size
    if positions[-1] != final:
        positions.append(final)
    return positions


def clip_box(box: Box, left: int, top: int, tile_size: int) -> Box | None:
    right = left + tile_size
    bottom = top + tile_size
    box_right = box.x + box.width
    box_bottom = box.y + box.height
    center_x = box.x + box.width / 2
    center_y = box.y + box.height / 2
    intersection_width = max(0.0, min(right, box_right) - max(left, box.x))
    intersection_height = max(0.0, min(bottom, box_bottom) - max(top, box.y))
    intersection = intersection_width * intersection_height
    visible = intersection / max(1.0, box.width * box.height)
    if not (left <= center_x < right and top <= center_y < bottom) and visible < 0.45:
        return None
    x1 = max(left, box.x) - left
    y1 = max(top, box.y) - top
    x2 = min(right, box_right) - left
    y2 = min(bottom, box_bottom) - top
    if x2 - x1 < 2 or y2 - y1 < 2:
        return None
    return Box(box.class_id, x1, y1, x2 - x1, y2 - y1)


def save_tile(
    image: Image.Image,
    boxes: list[Box],
    output_images: Path,
    file_name: str,
    output_size: int,
    image_id: int,
    annotation_id: int,
) -> tuple[dict, list[dict], int]:
    source_width, source_height = image.size
    scale_x = output_size / source_width
    scale_y = output_size / source_height
    if image.size != (output_size, output_size):
        image = image.resize((output_size, output_size), Image.Resampling.LANCZOS)
    output_path = output_images / file_name
    image.save(output_path, quality=90, optimize=True)
    annotations: list[dict] = []
    next_id = annotation_id
    for box in boxes:
        bbox = [round(box.x * scale_x, 3), round(box.y * scale_y, 3), round(box.width * scale_x, 3), round(box.height * scale_y, 3)]
        if bbox[2] < 2.0 or bbox[3] < 2.0:
            continue
        annotations.append({
            "id": next_id,
            "image_id": image_id,
            "category_id": box.class_id + 1,
            "bbox": bbox,
            "area": round(bbox[2] * bbox[3], 3),
            "iscrowd": 0,
        })
        next_id += 1
    return {"id": image_id, "file_name": file_name, "width": output_size, "height": output_size}, annotations, next_id


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--tile-size", type=int, default=1280)
    parser.add_argument("--stride", type=int, default=1120)
    parser.add_argument("--output-size", type=int, default=640)
    parser.add_argument("--synthetic-train-count", type=int, default=1600)
    parser.add_argument("--synthetic-val-count", type=int, default=200)
    parser.add_argument("--synthetic-test-count", type=int, default=200)
    parser.add_argument("--negative-rate", type=float, default=0.12)
    parser.add_argument("--seed", type=int, default=20260810)
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()

    if args.clean and args.output.exists():
        shutil.rmtree(args.output)

    classes, taxonomy = load_class_map()
    print("Veri setleri yükleniyor...")
    urban_cards = load_urban_cards(taxonomy)
    zenodo_cards = load_zenodo_cards(taxonomy)
    beetle_images, background_images = load_colored_beetles_and_backgrounds()
    all_real_cards = urban_cards + zenodo_cards

    print(f"Yüklenen gerçek kart sayısı: {len(all_real_cards)} (Urban: {len(urban_cards)}, Zenodo: {len(zenodo_cards)})")
    print(f"Yüklenen kınkanatlı görüntüleri: {len(beetle_images)}, Arka plan negatifleri: {len(background_images)}")

    if not all_real_cards:
        raise RuntimeError("Hiç kart bulunamadı. Önce download_datasets.py çalıştırın.")

    patch_bank = extract_patch_bank(all_real_cards, beetle_images)

    rng = random.Random(args.seed)
    shuffled_cards = all_real_cards[:]
    rng.shuffle(shuffled_cards)
    
    n_train = round(len(shuffled_cards) * 0.70)
    n_val = round(len(shuffled_cards) * 0.15)
    splits = {
        "train": (shuffled_cards[:n_train], args.synthetic_train_count),
        "val": (shuffled_cards[n_train:n_train + n_val], args.synthetic_val_count),
        "test": (shuffled_cards[n_train + n_val:], args.synthetic_test_count),
    }

    args.output.mkdir(parents=True, exist_ok=True)
    summary: dict = {}
    all_classes_counter = Counter()

    for split_name, (cards_subset, synth_count) in splits.items():
        print(f"\n--- {split_name.upper()} Bölümü Hazırlanıyor (Gerçek: {len(cards_subset)}, Sentetik: {synth_count}) ---")
        img_dir = args.output / f"{split_name}2017"
        img_dir.mkdir(parents=True, exist_ok=True)
        
        coco_images: list[dict] = []
        coco_annotations: list[dict] = []
        image_id = 1
        annotation_id = 1

        # 1. Process Real Cards with sliding window tiling
        for card_idx, card in enumerate(cards_subset, start=1):
            try:
                with Image.open(card.path) as opened:
                    for top in axis_positions(card.height, args.tile_size, args.stride):
                        for left in axis_positions(card.width, args.tile_size, args.stride):
                            clipped = [item for box in card.boxes if (item := clip_box(box, left, top, args.tile_size)) is not None]
                            if not clipped and rng.random() > args.negative_rate:
                                continue
                            crop = opened.crop((left, top, min(left + args.tile_size, card.width), min(top + args.tile_size, card.height))).convert("RGB")
                            if crop.size != (args.tile_size, args.tile_size):
                                padded = Image.new("RGB", (args.tile_size, args.tile_size), (245, 245, 245))
                                padded.paste(crop, (0, 0))
                                crop = padded
                            stem_hash = hashlib.sha1(f"{card.key}:{left}:{top}".encode()).hexdigest()[:10]
                            file_name = f"real_{card_idx:03d}_{stem_hash}.jpg"
                            img_rec, recs, annotation_id = save_tile(crop, clipped, img_dir, file_name, args.output_size, image_id, annotation_id)
                            coco_images.append(img_rec)
                            coco_annotations.extend(recs)
                            image_id += 1
                            for rec in recs:
                                all_classes_counter[rec["category_id"] - 1] += 1
            except Exception as e:
                print(f"Kart işleme hatası ({card.key}): {e}")

        # 2. Process Synthetic Multi-Pest Cards
        print(f"{split_name} için {synth_count} adet sentetik çoklu zararlı kart üretiliyor...")
        for s_idx in range(synth_count):
            synth_img, synth_boxes = create_synthetic_card(
                s_idx,
                patch_bank,
                background_images,
                canvas_size=args.output_size,
                seed=args.seed + (0 if split_name == 'train' else 5000 if split_name == 'val' else 10000),
            )
            file_name = f"synth_{s_idx:04d}.jpg"
            img_rec, recs, annotation_id = save_tile(synth_img, synth_boxes, img_dir, file_name, args.output_size, image_id, annotation_id)
            coco_images.append(img_rec)
            coco_annotations.extend(recs)
            image_id += 1
            for rec in recs:
                all_classes_counter[rec["category_id"] - 1] += 1

        # 3. Add Pure Hard Negatives (Empty background tiles)
        if background_images and split_name == "train":
            neg_samples = rng.sample(background_images, min(len(background_images), 120))
            for neg_idx, neg_path in enumerate(neg_samples):
                try:
                    with Image.open(neg_path) as neg_opened:
                        neg_img = neg_opened.convert("RGB")
                        file_name = f"neg_{neg_idx:03d}.jpg"
                        img_rec, recs, annotation_id = save_tile(neg_img, [], img_dir, file_name, args.output_size, image_id, annotation_id)
                        coco_images.append(img_rec)
                        image_id += 1
                except Exception:
                    pass

        # Save COCO JSON
        ann_dir = args.output / "annotations"
        ann_dir.mkdir(parents=True, exist_ok=True)
        coco_payload = {
            "info": {"description": "PestneerVision Enhanced Multi-Pest Dataset", "version": "2.0.0"},
            "licenses": [{"id": 1, "name": "CC BY 4.0", "url": "https://creativecommons.org/licenses/by/4.0/"}],
            "images": coco_images,
            "annotations": coco_annotations,
            "categories": [{"id": item["id"] + 1, "name": item["key"], "supercategory": "insect"} for item in classes],
        }
        ann_file = ann_dir / f"instances_{split_name}2017.json"
        ann_file.write_text(json.dumps(coco_payload, ensure_ascii=False), encoding="utf-8")
        summary[split_name] = {
            "real_cards": len(cards_subset),
            "synthetic_cards": synth_count,
            "total_images": len(coco_images),
            "total_annotations": len(coco_annotations),
        }

    summary["classes"] = {classes[cid]["key"]: all_classes_counter[cid] for cid in range(len(classes))}
    (args.output / "dataset-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n=== VERİ SETİ ÖZETİ ===")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

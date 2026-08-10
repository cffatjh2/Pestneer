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

from PIL import Image, ImageEnhance, ImageOps


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
    taxonomy = {
        taxon.casefold(): item["id"]
        for item in classes
        for taxon in item["sourceTaxa"]
    }
    return classes, taxonomy


def find_image(folder: Path, file_name: str) -> Path:
    direct = folder / file_name
    if direct.exists():
        return direct
    matches = list(folder.rglob(Path(file_name).name))
    if len(matches) != 1:
        raise FileNotFoundError(f"Görüntü eşleştirilemedi: {file_name}")
    return matches[0]


def load_cards(taxonomy: dict[str, int]) -> list[Card]:
    cards: list[Card] = []
    for annotation_path in sorted(RAW.rglob("instances_default.json")):
        payload = json.loads(annotation_path.read_text(encoding="utf-8-sig"))
        categories = {item["id"]: item["name"] for item in payload["categories"]}
        annotations: dict[int, list[Box]] = defaultdict(list)
        for item in payload["annotations"]:
            taxon = categories[item["category_id"]].casefold()
            if taxon not in taxonomy:
                continue
            x, y, width, height = item["bbox"]
            if width < 2 or height < 2:
                continue
            annotations[item["image_id"]].append(Box(taxonomy[taxon], x, y, width, height))
        for image in payload["images"]:
            path = find_image(annotation_path.parent, image["file_name"])
            key = f"{annotation_path.parent.name}:{path.stem}"
            cards.append(Card(key, path, image["width"], image["height"], tuple(annotations[image["id"]])))
    if not cards:
        raise RuntimeError("COCO kart verisi bulunamadı. Önce download_datasets.py çalıştırın.")
    return cards


def split_cards(cards: list[Card], seed: int) -> dict[str, list[Card]]:
    shuffled = cards[:]
    random.Random(seed).shuffle(shuffled)
    targets = {"train": round(len(cards) * 0.70), "val": round(len(cards) * 0.15)}
    targets["test"] = len(cards) - targets["train"] - targets["val"]
    splits = {
        "train": shuffled[: targets["train"]],
        "val": shuffled[targets["train"] : targets["train"] + targets["val"]],
        "test": shuffled[targets["train"] + targets["val"] :],
    }
    all_classes = {box.class_id for card in cards for box in card.boxes}
    train_classes = {box.class_id for card in splits["train"] for box in card.boxes}
    for missing in sorted(all_classes - train_classes):
        donor_name = next(
            name for name in ("val", "test")
            if any(any(box.class_id == missing for box in card.boxes) for card in splits[name])
        )
        donor_card = next(card for card in splits[donor_name] if any(box.class_id == missing for box in card.boxes))
        replacement = next(
            card for card in reversed(splits["train"])
            if all(box.class_id != missing for box in card.boxes)
        )
        splits[donor_name].remove(donor_card)
        splits["train"].remove(replacement)
        splits[donor_name].append(replacement)
        splits["train"].append(donor_card)
    return splits


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


def transform_augmented(image: Image.Image, boxes: list[Box], variant: str) -> tuple[Image.Image, list[Box]]:
    width, height = image.size
    if variant == "flip_h":
        return ImageOps.mirror(image), [Box(box.class_id, width - box.x - box.width, box.y, box.width, box.height) for box in boxes]
    if variant == "flip_v":
        return ImageOps.flip(image), [Box(box.class_id, box.x, height - box.y - box.height, box.width, box.height) for box in boxes]
    if variant == "rot180":
        return image.rotate(180), [Box(box.class_id, width - box.x - box.width, height - box.y - box.height, box.width, box.height) for box in boxes]
    return image, boxes


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
    image = image.resize((output_size, output_size), Image.Resampling.LANCZOS)
    output_path = output_images / file_name
    image.save(output_path, quality=90, optimize=True)
    annotations: list[dict] = []
    next_id = annotation_id
    for box in boxes:
        bbox = [round(box.x * scale_x, 3), round(box.y * scale_y, 3), round(box.width * scale_x, 3), round(box.height * scale_y, 3)]
        if bbox[2] < 1.5 or bbox[3] < 1.5:
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


def prepare_split(
    name: str,
    cards: Iterable[Card],
    output: Path,
    classes: list[dict],
    tile_size: int,
    stride: int,
    output_size: int,
    negative_rate: float,
    minority_augmentation: bool,
    seed: int,
) -> dict:
    image_dir = output / f"{name}2017"
    image_dir.mkdir(parents=True, exist_ok=True)
    coco_images: list[dict] = []
    coco_annotations: list[dict] = []
    image_id = 1
    annotation_id = 1
    randomizer = random.Random(seed + len(name))
    minority_classes = {4, 5, 6}
    for card_index, card in enumerate(cards, start=1):
        with Image.open(card.path) as opened:
            card_image = opened.convert("RGB")
            for top in axis_positions(card.height, tile_size, stride):
                for left in axis_positions(card.width, tile_size, stride):
                    clipped = [item for box in card.boxes if (item := clip_box(box, left, top, tile_size)) is not None]
                    if not clipped and randomizer.random() > negative_rate:
                        continue
                    crop = card_image.crop((left, top, min(left + tile_size, card.width), min(top + tile_size, card.height)))
                    if crop.size != (tile_size, tile_size):
                        padded = Image.new("RGB", (tile_size, tile_size), (245, 245, 245))
                        padded.paste(crop, (0, 0))
                        crop = padded
                    stem_hash = hashlib.sha1(f"{card.key}:{left}:{top}".encode()).hexdigest()[:12]
                    file_name = f"{card_index:03d}_{stem_hash}.jpg"
                    image_record, records, annotation_id = save_tile(crop, clipped, image_dir, file_name, output_size, image_id, annotation_id)
                    coco_images.append(image_record)
                    coco_annotations.extend(records)
                    image_id += 1
                    if name == "train" and minority_augmentation and any(box.class_id in minority_classes for box in clipped):
                        variant = ("flip_h", "flip_v", "rot180")[(image_id + card_index) % 3]
                        augmented, augmented_boxes = transform_augmented(crop, clipped, variant)
                        augmented = ImageEnhance.Contrast(augmented).enhance(0.9 + randomizer.random() * 0.25)
                        aug_name = f"{card_index:03d}_{stem_hash}_{variant}.jpg"
                        image_record, records, annotation_id = save_tile(augmented, augmented_boxes, image_dir, aug_name, output_size, image_id, annotation_id)
                        coco_images.append(image_record)
                        coco_annotations.extend(records)
                        image_id += 1
    annotations_dir = output / "annotations"
    annotations_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "info": {"description": "PestneerVision sticky-card tiles", "version": "1.0.0"},
        "licenses": [{"id": 1, "name": "CC BY 4.0", "url": "https://creativecommons.org/licenses/by/4.0/"}],
        "images": coco_images,
        "annotations": coco_annotations,
        "categories": [{"id": item["id"] + 1, "name": item["key"], "supercategory": "insect"} for item in classes],
    }
    (annotations_dir / f"instances_{name}2017.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return {"cards": len(list(cards)), "images": len(coco_images), "annotations": len(coco_annotations)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--tile-size", type=int, default=1280)
    parser.add_argument("--stride", type=int, default=1120)
    parser.add_argument("--output-size", type=int, default=640)
    parser.add_argument("--negative-rate", type=float, default=0.12)
    parser.add_argument("--seed", type=int, default=20260810)
    parser.add_argument("--clean", action="store_true")
    parser.add_argument("--no-minority-augmentation", action="store_true")
    args = parser.parse_args()
    if args.clean and args.output.exists():
        shutil.rmtree(args.output)
    classes, taxonomy = load_class_map()
    cards = load_cards(taxonomy)
    splits = split_cards(cards, args.seed)
    args.output.mkdir(parents=True, exist_ok=True)
    summary = {
        name: prepare_split(
            name,
            split_cards_value,
            args.output,
            classes,
            args.tile_size,
            args.stride,
            args.output_size,
            args.negative_rate,
            not args.no_minority_augmentation,
            args.seed,
        )
        for name, split_cards_value in splits.items()
    }
    class_counts = Counter(box.class_id for card in cards for box in card.boxes)
    summary["source"] = {
        "cards": len(cards),
        "annotations": sum(class_counts.values()),
        "classes": {classes[class_id]["key"]: count for class_id, count in sorted(class_counts.items())},
    }
    (args.output / "dataset-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()


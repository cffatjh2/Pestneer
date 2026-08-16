from __future__ import annotations

import argparse
import json
import math
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image
import torch


ROOT = Path(__file__).resolve().parents[1]


def load_classes():
    payload = json.loads((ROOT / "configs" / "classes.json").read_text(encoding="utf-8"))
    return [item["key"] for item in payload["classes"]]


def iou(box1, box2):
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[0] + box1[2], box2[0] + box2[2])
    y2 = min(box1[1] + box1[3], box2[1] + box2[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    union = box1[2] * box1[3] + box2[2] * box2[3] - inter
    return inter / union if union > 0 else 0


def nms(boxes, iou_thresh=0.45):
    if not boxes:
        return []
    boxes = sorted(boxes, key=lambda b: b[5], reverse=True)
    kept = []
    while boxes:
        best = boxes.pop(0)
        kept.append(best)
        boxes = [b for b in boxes if b[4] != best[4] or iou((b[0], b[1], b[2], b[3]), (best[0], best[1], best[2], best[3])) < iou_thresh]
    return kept


def evaluate_onnx(onnx_path: Path, test_dir: Path, ann_path: Path, max_samples: int = 150):
    import onnxruntime as ort

    classes = load_classes()
    coco_data = json.loads(ann_path.read_text(encoding="utf-8"))
    annotations_by_img = defaultdict(list)
    for ann in coco_data["annotations"]:
        annotations_by_img[ann["image_id"]].append(ann)

    images = coco_data["images"][:max_samples]
    session = ort.InferenceSession(str(onnx_path), providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name

    total_gt = defaultdict(int)
    total_pred = defaultdict(int)
    correct_matches = defaultdict(int)
    total_inference_time = 0.0

    print(f"\nEvaluating ONNX model: {onnx_path.name} on {len(images)} test images...")

    for img_info in images:
        img_id = img_info["id"]
        file_name = img_info["file_name"]
        img_path = test_dir / file_name
        if not img_path.exists():
            continue

        with Image.open(img_path) as opened:
            orig_w, orig_h = opened.size
            scale = min(640 / orig_w, 640 / orig_h)
            new_w = int(orig_w * scale)
            new_h = int(orig_h * scale)
            resized = opened.convert("RGB").resize((new_w, new_h), Image.Resampling.BILINEAR)
            
            # Letterbox pad with 114
            padded = Image.new("RGB", (640, 640), (114, 114, 114))
            padded.paste(resized, (0, 0))
            
            arr = np.array(padded, dtype=np.float32)
            # Convert RGB to BGR: (R, G, B) -> (B, G, R)
            arr = arr[:, :, ::-1]
            arr = np.transpose(arr, (2, 0, 1))
            arr = np.expand_dims(arr, axis=0)

        t0 = time.perf_counter()
        outputs = session.run([output_name], {input_name: arr})[0]
        total_inference_time += (time.perf_counter() - t0)

        out = outputs[0]
        gt_boxes = annotations_by_img[img_id]
        for gt in gt_boxes:
            cid = gt["category_id"] - 1
            total_gt[cid] += 1

        pred_boxes = []
        for row in out:
            obj_conf = row[4]
            cls_scores = row[5:5 + len(classes)]
            cls_id = int(np.argmax(cls_scores))
            cls_score = cls_scores[cls_id]
            conf = obj_conf * cls_score

            if conf > 0.18:
                cx, cy, w, h = row[0], row[1], row[2], row[3]
                # Map back from scale to original coords
                x = (cx - w / 2) / scale
                y = (cy - h / 2) / scale
                pw = w / scale
                ph = h / scale
                pred_boxes.append((x, y, pw, ph, cls_id, conf))

        pred_boxes = nms(pred_boxes, iou_thresh=0.45)
        for _, _, _, _, pcid, _ in pred_boxes:
            total_pred[pcid] += 1

        # Match preds to GT (IoU >= 0.35)
        matched_gt = set()
        for px, py, pw, ph, pcid, pconf in pred_boxes:
            for idx, gt in enumerate(gt_boxes):
                if idx in matched_gt:
                    continue
                gcid = gt["category_id"] - 1
                if pcid == gcid and iou((px, py, pw, ph), gt["bbox"]) >= 0.40:
                    matched_gt.add(idx)
                    correct_matches[pcid] += 1
                    break

    avg_latency = (total_inference_time / len(images)) * 1000
    print("\n" + "=" * 75)
    print(f"{'Sınıf':<22} | {'Gerçek (GT)':<12} | {'Tahmin (Pred)':<14} | {'Doğru Eşleşen':<14} | {'Duyarlılık (Recall)':<12}")
    print("=" * 75)

    all_gt_sum = sum(total_gt.values())
    all_pred_sum = sum(total_pred.values())
    all_match_sum = sum(correct_matches.values())

    for cid, cname in enumerate(classes):
        gt_cnt = total_gt[cid]
        pred_cnt = total_pred[cid]
        match_cnt = correct_matches[cid]
        recall = (match_cnt / gt_cnt * 100) if gt_cnt > 0 else 100.0
        print(f"{cname:<22} | {gt_cnt:<12} | {pred_cnt:<14} | {match_cnt:<14} | %{recall:.1f}")

    print("-" * 75)
    total_recall = (all_match_sum / all_gt_sum * 100) if all_gt_sum > 0 else 0
    print(f"{'TOPLAM / ORTALAMA':<22} | {all_gt_sum:<12} | {all_pred_sum:<14} | {all_match_sum:<14} | %{total_recall:.1f}")
    print(f"Ortalama Çıkarım Süresi: {avg_latency:.2f} ms / görüntü")
    print("=" * 75 + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx", type=Path, default=ROOT.parent / "frontend/public/models/pestneer-vision/pestneer-pvision-v1.onnx")
    parser.add_argument("--samples", type=int, default=150)
    args = parser.parse_args()

    test_dir = ROOT / "data" / "processed" / "PestneerVision" / "test2017"
    ann_path = ROOT / "data" / "processed" / "PestneerVision" / "annotations" / "instances_test2017.json"

    if not args.onnx.exists():
        print(f"ONNX model dosyası bulunamadı: {args.onnx}")
        return

    evaluate_onnx(args.onnx, test_dir, ann_path, max_samples=args.samples)


if __name__ == "__main__":
    main()

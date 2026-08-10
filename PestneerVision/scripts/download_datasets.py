from __future__ import annotations

import argparse
import json
import shutil
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def download(url: str, destination: Path, expected_size: int) -> None:
    if destination.exists() and destination.stat().st_size == expected_size:
        print(f"Hazır: {destination.name}")
        return
    partial = destination.with_suffix(destination.suffix + ".part")
    print(f"İndiriliyor: {destination.name}")
    with urllib.request.urlopen(url) as response, partial.open("wb") as output:
        shutil.copyfileobj(response, output, 1024 * 1024)
    if partial.stat().st_size != expected_size:
        raise RuntimeError(f"Dosya boyutu doğrulanamadı: {destination.name}")
    partial.replace(destination)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--include-noncommercial", action="store_true")
    parser.add_argument("--skip-extract", action="store_true")
    args = parser.parse_args()
    raw = ROOT / "data" / "raw"
    extracted = raw / "extracted"
    raw.mkdir(parents=True, exist_ok=True)
    extracted.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / "configs" / "datasets.json").read_text(encoding="utf-8"))
    for dataset in manifest["datasets"]:
        if not dataset.get("enabledForCommercialTraining", False) and not args.include_noncommercial:
            print(f"Atlandı ({dataset['license']}): {dataset['title']}")
            continue
        for name, url, size in dataset.get("files", []):
            archive = raw / name
            download(url, archive, size)
            if args.skip_extract:
                continue
            destination = extracted / Path(name).stem
            marker = destination / ".complete"
            if marker.exists():
                continue
            destination.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(archive) as zipped:
                zipped.extractall(destination)
            marker.write_text("ok", encoding="utf-8")


if __name__ == "__main__":
    main()


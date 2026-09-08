"""Verify NanoDB layout samples against their manifest."""

from __future__ import annotations

import csv
import hashlib
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SAMPLE_ROOT = PROJECT_ROOT / "data" / "samples" / "layout"
IMAGE_ROOT = SAMPLE_ROOT / "images"
MANIFEST_PATH = SAMPLE_ROOT / "metadata.csv"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    with MANIFEST_PATH.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))

    filenames = [row["filename"] for row in rows]
    sample_ids = [row["sample_id"] for row in rows]
    if len(filenames) != len(set(filenames)):
        errors.append("manifest contains duplicate filenames")
    if len(sample_ids) != len(set(sample_ids)):
        errors.append("manifest contains duplicate sample IDs")

    expected = set(filenames)
    actual = {path.name for path in IMAGE_ROOT.glob("*.tif")}
    for name in sorted(expected - actual):
        errors.append(f"missing image: {name}")
    for name in sorted(actual - expected):
        errors.append(f"image is not listed in manifest: {name}")

    for row in rows:
        path = IMAGE_ROOT / row["filename"]
        if not path.is_file():
            continue
        if sha256(path) != row["sha256"]:
            errors.append(f"SHA-256 mismatch: {row['filename']}")

        with Image.open(path) as image:
            expected_size = (int(row["pixel_width"]), int(row["pixel_height"]))
            if image.size != expected_size:
                errors.append(f"pixel dimensions mismatch: {row['filename']}")
            if image.mode != row["color_mode"]:
                errors.append(f"color mode mismatch: {row['filename']}")
            if str(image.info.get("compression")) != row["compression"]:
                errors.append(f"compression mismatch: {row['filename']}")

        if row["license"] == "UNVERIFIED":
            warnings.append(f"redistribution rights unverified: {row['filename']}")

    print(f"Checked {len(rows)} manifest entries.")
    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}")

    if errors:
        print(f"Verification failed with {len(errors)} error(s).")
        return 1
    print(f"Verification passed with {len(warnings)} warning(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

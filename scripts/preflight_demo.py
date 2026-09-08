"""Verify NANoDB demo derivatives against their manifest before a demo.

This preflight is offline and read-only. It confirms that the manifest and the
prepared PNG derivatives are consistent and safe to use: at least three
entries, no duplicates, every listed file present and no unlisted file,
decodable PNGs whose dimensions match the recorded original size, matching
SHA-256, a positive calibration, a known SEM/TEM type, non-empty
Product/Lot/Wafer, an authorized source and a valid conversion timestamp. It
also validates the approved source and derivative SHA-256 values and confirms
the demo image root is separate from both the source sample root and the
runtime upload root.
"""

from __future__ import annotations

import csv
import hashlib
from datetime import datetime
from pathlib import Path

from PIL import Image as PillowImage
from PIL import UnidentifiedImageError

if __package__:
    from scripts.prepare_demo_samples import (
        AUTHORIZED_LICENSE,
        DEMO_IMAGE_ROOT,
        DEMO_MANIFEST,
        MANIFEST_FIELDS,
        SOURCE_IMAGE_ROOT,
        SOURCE_MANIFEST,
        SUPPORTED_IMAGE_TYPES,
    )
else:
    from prepare_demo_samples import (
        AUTHORIZED_LICENSE,
        DEMO_IMAGE_ROOT,
        DEMO_MANIFEST,
        MANIFEST_FIELDS,
        SOURCE_IMAGE_ROOT,
        SOURCE_MANIFEST,
        SUPPORTED_IMAGE_TYPES,
    )

MINIMUM_DEMO_IMAGES = 3


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _approved_sources() -> dict[str, dict[str, str]]:
    if not SOURCE_MANIFEST.is_file():
        return {}
    with SOURCE_MANIFEST.open(encoding="utf-8", newline="") as stream:
        return {
            row["sample_id"]: row
            for row in csv.DictReader(stream)
            if row.get("license") == AUTHORIZED_LICENSE
        }


def _root_errors(upload_root: Path) -> list[str]:
    errors: list[str] = []
    source = SOURCE_IMAGE_ROOT.resolve()
    demo = DEMO_IMAGE_ROOT.resolve()
    runtime = upload_root.resolve()
    for label, other in (("source sample", source), ("runtime upload", runtime)):
        if demo == other or demo in other.parents or other in demo.parents:
            errors.append(f"demo image root overlaps the {label} root")
    return errors


def _decode_dimensions(path: Path) -> tuple[int, int]:
    with PillowImage.open(path) as image:
        image.verify()
    with PillowImage.open(path) as image:
        image.load()
        if image.format != "PNG":
            raise ValueError(f"derivative is not PNG: {path.name}")
        return image.size


def run() -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not DEMO_MANIFEST.is_file():
        return [f"demo manifest is missing: {DEMO_MANIFEST}"], warnings

    with DEMO_MANIFEST.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != list(MANIFEST_FIELDS):
            errors.append("manifest header does not match the expected fields")
        rows = list(reader)

    if errors:
        return errors, warnings

    if len(rows) < MINIMUM_DEMO_IMAGES:
        errors.append(
            f"manifest lists {len(rows)} derivative(s); at least "
            f"{MINIMUM_DEMO_IMAGES} are required"
        )

    source_ids = [row["source_id"] for row in rows]
    demo_files = [row["demo_filename"] for row in rows]
    if len(source_ids) != len(set(source_ids)):
        errors.append("manifest contains duplicate source IDs")
    if len(demo_files) != len(set(demo_files)):
        errors.append("manifest contains duplicate demo filenames")

    expected = set(demo_files)
    actual = {path.name for path in DEMO_IMAGE_ROOT.glob("*.png")}
    for name in sorted(expected - actual):
        errors.append(f"missing demo derivative: {name}")
    for name in sorted(actual - expected):
        errors.append(f"derivative is not listed in manifest: {name}")

    approved_sources = _approved_sources()
    for row in rows:
        name = row["demo_filename"]
        source_record = approved_sources.get(row["source_id"])
        if source_record is None:
            errors.append(f"source is not authorized: {row['source_id']}")
        else:
            source_path = SOURCE_IMAGE_ROOT / source_record["filename"]
            if not source_path.is_file():
                errors.append(f"source image is missing: {row['source_id']}")
            else:
                actual_source_sha256 = _sha256(source_path)
                if row["source_sha256"] != source_record["sha256"]:
                    errors.append(
                        f"recorded source SHA-256 is not approved: {row['source_id']}"
                    )
                if actual_source_sha256 != row["source_sha256"]:
                    errors.append(f"source SHA-256 mismatch: {row['source_id']}")
        if row["image_type"] not in SUPPORTED_IMAGE_TYPES:
            errors.append(f"unsupported image type: {name}")
        for field in ("product_id", "lot_id", "wafer_id"):
            if not row[field].strip():
                errors.append(f"{field} is empty: {name}")
        try:
            if float(row["calibration_nm_per_pixel"]) <= 0:
                errors.append(f"calibration must be positive: {name}")
        except ValueError:
            errors.append(f"calibration is not numeric: {name}")
        try:
            datetime.fromisoformat(row["converted_at"].replace("Z", "+00:00"))
        except ValueError:
            errors.append(f"converted_at is not a valid timestamp: {name}")

        path = DEMO_IMAGE_ROOT / name
        if not path.is_file():
            continue
        try:
            width, height = _decode_dimensions(path)
        except (OSError, UnidentifiedImageError, ValueError) as error:
            errors.append(f"cannot decode derivative: {name} ({error})")
            continue
        if (str(width), str(height)) != (
            row["original_pixel_width"],
            row["original_pixel_height"],
        ):
            errors.append(f"recorded dimensions do not match derivative: {name}")
        if _sha256(path) != row["derivative_sha256"]:
            errors.append(f"derivative SHA-256 mismatch: {name}")

    errors.extend(_root_errors(Path("var/uploads")))
    return errors, warnings


def main() -> int:
    errors, warnings = run()
    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}")
    if errors:
        print(f"Preflight failed with {len(errors)} error(s).")
        return 1
    print("Demo preflight passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

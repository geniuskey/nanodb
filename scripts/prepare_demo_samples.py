"""Prepare approved TEM sources as lossless PNG demo derivatives.

The curated ``DEMO_SPECS`` below reference approved TEM sample sources by ID.
Running this tool decodes each source TIFF, writes a lossless PNG derivative
into ``data/demo/images/`` and records provenance into ``data/demo/manifest.csv``:
source ID, source and derivative SHA-256 values, conversion time, original
pixel size, SEM/TEM type, Product/Lot/Wafer and a positive calibration value.

The default run is offline and never touches the database or the runtime
upload root. Passing ``--load`` seeds the prepared derivatives into the demo
database and ``var/uploads/`` through the application service; it requires
``NANODB_PROFILE=demo``. The source sample directory is only ever read.

Example:
    python scripts/prepare_demo_samples.py
    NANODB_PROFILE=demo python scripts/prepare_demo_samples.py --load
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from PIL import Image as PillowImage
from PIL import UnidentifiedImageError

PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Make the backend package importable for the optional ``--load`` path when the
# tool is run standalone from the project root.
_BACKEND_ROOT = str(PROJECT_ROOT / "src" / "backend")
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

SOURCE_ROOT = PROJECT_ROOT / "data" / "samples" / "tem"
SOURCE_IMAGE_ROOT = SOURCE_ROOT / "images"
SOURCE_MANIFEST = SOURCE_ROOT / "metadata.csv"
DEMO_ROOT = PROJECT_ROOT / "data" / "demo"
DEMO_IMAGE_ROOT = DEMO_ROOT / "images"
DEMO_MANIFEST = DEMO_ROOT / "manifest.csv"

AUTHORIZED_LICENSE = "PROJECT_AUTHORIZED"
SUPPORTED_IMAGE_TYPES = frozenset({"SEM", "TEM"})

MANIFEST_FIELDS = (
    "source_id",
    "source_sha256",
    "demo_filename",
    "image_type",
    "product_id",
    "lot_id",
    "wafer_id",
    "calibration_nm_per_pixel",
    "original_pixel_width",
    "original_pixel_height",
    "derivative_sha256",
    "converted_at",
)


@dataclass(frozen=True)
class DemoSpec:
    """A curated mapping from an approved source sample to a demo derivative."""

    source_id: str
    demo_filename: str
    image_type: str
    product_id: str
    lot_id: str
    wafer_id: str


# At least three approved TEM sources with distinct devices and positive
# calibration values. Calibration is read from the source manifest so the demo
# value always matches the approved sample.
DEMO_SPECS: tuple[DemoSpec, ...] = (
    DemoSpec("tem_001", "demo_tem_001.png", "TEM", "DEMO-DRAM-1Z", "LOTDEMO01", "W01"),
    DemoSpec(
        "tem_002", "demo_tem_002.png", "TEM", "DEMO-3DNAND-176L", "LOTDEMO02", "W02"
    ),
    DemoSpec("tem_003", "demo_tem_003.png", "TEM", "DEMO-LOGIC-N3", "LOTDEMO03", "W03"),
)


class PreparationError(RuntimeError):
    """Raised when demo derivatives cannot be prepared safely."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _utc_now() -> str:
    return (
        datetime.now(UTC)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _load_approved_sources() -> dict[str, dict[str, str]]:
    if not SOURCE_MANIFEST.is_file():
        raise PreparationError(f"source manifest is missing: {SOURCE_MANIFEST}")
    with SOURCE_MANIFEST.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    approved: dict[str, dict[str, str]] = {}
    for row in rows:
        if row.get("license") != AUTHORIZED_LICENSE:
            continue
        approved[row["sample_id"]] = row
    return approved


def _assert_isolated_roots() -> None:
    source = SOURCE_IMAGE_ROOT.resolve()
    demo = DEMO_IMAGE_ROOT.resolve()
    if source == demo or source in demo.parents or demo in source.parents:
        raise PreparationError(
            "demo image root must be separate from the source sample root"
        )


def _convert_to_png(source_path: Path, demo_path: Path) -> tuple[int, int]:
    try:
        with PillowImage.open(source_path) as image:
            image.load()
            width, height = image.size
            # PNG is lossless; keep RGB(A)/grayscale/palette, otherwise flatten.
            if image.mode in {"1", "L", "LA", "I", "P", "RGB", "RGBA"}:
                out = image
            else:
                out = image.convert("RGB")
            out.save(demo_path, format="PNG", optimize=False)
    except (OSError, UnidentifiedImageError) as error:
        raise PreparationError(f"cannot decode source image: {source_path}") from error
    if width <= 0 or height <= 0:
        raise PreparationError(f"source image has non-positive size: {source_path}")
    return width, height


def prepare() -> list[dict[str, str]]:
    """Generate PNG derivatives and the manifest; return the manifest rows."""
    _assert_isolated_roots()
    approved_sources = _load_approved_sources()
    DEMO_IMAGE_ROOT.mkdir(parents=True, exist_ok=True)

    seen_sources: set[str] = set()
    seen_files: set[str] = set()
    rows: list[dict[str, str]] = []
    for spec in DEMO_SPECS:
        if spec.source_id in seen_sources:
            raise PreparationError(f"duplicate source in specs: {spec.source_id}")
        if spec.demo_filename in seen_files:
            raise PreparationError(
                f"duplicate demo file in specs: {spec.demo_filename}"
            )
        seen_sources.add(spec.source_id)
        seen_files.add(spec.demo_filename)

        if spec.image_type not in SUPPORTED_IMAGE_TYPES:
            raise PreparationError(f"unsupported image type: {spec.image_type}")
        source_record = approved_sources.get(spec.source_id)
        if source_record is None:
            raise PreparationError(
                f"source is missing or unauthorized: {spec.source_id}"
            )
        calibration = source_record["length_nm_per_pixel"]
        if float(calibration) <= 0:
            raise PreparationError(
                f"calibration must be positive: {spec.source_id}"
            )

        source_path = SOURCE_IMAGE_ROOT / f"{spec.source_id}.tif"
        if not source_path.is_file():
            raise PreparationError(f"source image is missing: {source_path}")
        source_sha256 = _sha256(source_path)
        if source_sha256 != source_record["sha256"]:
            raise PreparationError(
                f"source SHA-256 does not match its manifest: {spec.source_id}"
            )

        demo_path = DEMO_IMAGE_ROOT / spec.demo_filename
        width, height = _convert_to_png(source_path, demo_path)
        rows.append(
            {
                "source_id": spec.source_id,
                "source_sha256": source_sha256,
                "demo_filename": spec.demo_filename,
                "image_type": spec.image_type,
                "product_id": spec.product_id,
                "lot_id": spec.lot_id,
                "wafer_id": spec.wafer_id,
                "calibration_nm_per_pixel": calibration,
                "original_pixel_width": str(width),
                "original_pixel_height": str(height),
                "derivative_sha256": _sha256(demo_path),
                "converted_at": _utc_now(),
            }
        )

    _write_manifest(rows)
    return rows


def _write_manifest(rows: list[dict[str, str]]) -> None:
    DEMO_ROOT.mkdir(parents=True, exist_ok=True)
    with DEMO_MANIFEST.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=MANIFEST_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def load_into_demo(rows: list[dict[str, str]]) -> int:
    """Seed prepared derivatives into the demo database and upload root."""
    # Imported lazily so the offline prepare path needs no backend dependency.
    from nanodb.adapters import FileStore, ImageDecoder
    from nanodb.domain.entities import ImageType
    from nanodb.persistence.database import create_session_factory
    from nanodb.services.image_service import ImageRegistration, ImageService
    from nanodb.settings import Settings

    explicit_profile = os.environ.get("NANODB_PROFILE")
    if explicit_profile != "demo":
        raise PreparationError(
            "loading demo data requires an explicit NANODB_PROFILE=demo "
            f"(current: {explicit_profile!r})"
        )
    settings = Settings()
    _, session_factory = create_session_factory(
        settings.database_url,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_timeout=settings.database_pool_timeout,
    )
    service = ImageService(
        session_factory, FileStore(settings.upload_root), ImageDecoder()
    )

    loaded = 0
    for row in rows:
        demo_path = DEMO_IMAGE_ROOT / row["demo_filename"]
        registration = ImageRegistration(
            original_filename=row["demo_filename"],
            image_type=ImageType(row["image_type"]),
            product_id=row["product_id"],
            lot_id=row["lot_id"],
            wafer_id=row["wafer_id"],
            calibration_nm_per_pixel=float(row["calibration_nm_per_pixel"]),
        )
        with demo_path.open("rb") as stream:
            service.register(stream, registration)
        loaded += 1
    return loaded


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare NANoDB demo derivatives")
    parser.add_argument(
        "--load",
        action="store_true",
        help="seed prepared derivatives into the demo DB and upload root",
    )
    args = parser.parse_args()

    try:
        rows = prepare()
    except PreparationError as error:
        print(f"ERROR: {error}")
        return 1

    print(f"Prepared {len(rows)} demo derivative(s) into {DEMO_IMAGE_ROOT}.")
    print(f"Wrote manifest: {DEMO_MANIFEST}")

    if args.load:
        try:
            loaded = load_into_demo(rows)
        except PreparationError as error:
            print(f"ERROR: {error}")
            return 1
        print(f"Loaded {loaded} demo image(s) into the demo database.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

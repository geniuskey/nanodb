"""Reset the NANoDB demo database and runtime upload root to an empty state.

This tool clears runtime Image and Measurement rows and the
runtime upload directory so a demo can start from a known-empty baseline. It
is guarded to avoid destroying anything unintended:

- ``NANODB_PROFILE`` must be ``demo``.
- an explicit ``--yes`` confirmation is required (the resolved target database
  and upload root are printed first).
- the upload root must be a clear, dedicated directory that does not overlap
  the source sample or demo derivative directories.
- unless ``--no-backup`` is passed, the rows that are about to be deleted and
  every upload binary are snapshotted to ``var/backups/reset-<timestamp>/``
  first, so a mistaken reset can be recovered.

The source samples (``data/samples/``) and demo derivatives (``data/demo/``)
are never modified.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = PROJECT_ROOT / "data" / "samples"
DEMO_ROOT = PROJECT_ROOT / "data" / "demo"
EXPECTED_UPLOAD_ROOT = PROJECT_ROOT / "var" / "uploads"
BACKUP_ROOT = PROJECT_ROOT / "var" / "backups"

# Make the backend package importable when run standalone from the project root.
_BACKEND_ROOT = str(PROJECT_ROOT / "src" / "backend")
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)


class ResetGuardError(RuntimeError):
    """Raised when the demo reset target fails a safety guard."""


def _assert_safe_upload_root(upload_root: Path) -> Path:
    resolved = upload_root.resolve()
    if resolved != EXPECTED_UPLOAD_ROOT.resolve():
        raise ResetGuardError(
            "upload root must match the dedicated demo target: "
            f"{EXPECTED_UPLOAD_ROOT.resolve()}"
        )
    for label, protected in (
        ("source sample", SOURCE_ROOT.resolve()),
        ("demo derivative", DEMO_ROOT.resolve()),
    ):
        if (
            resolved == protected
            or protected in resolved.parents
            or resolved in protected.parents
        ):
            raise ResetGuardError(
                f"upload root overlaps the {label} directory: {resolved}"
            )
    return resolved


def _clear_directory(root: Path) -> None:
    """Remove files under ``root`` and ``root/.staging`` but keep the folders."""
    if not root.exists():
        root.mkdir(parents=True, exist_ok=True)
        return
    for entry in root.iterdir():
        if entry.is_file() or entry.is_symlink():
            entry.unlink()
        elif entry.is_dir():
            shutil.rmtree(entry)
    (root / ".staging").mkdir(parents=True, exist_ok=True)


def _row_to_dict(row: object) -> dict[str, object]:
    """Serialize an ORM row to a plain dict keyed by column name."""
    columns = row.__table__.columns  # type: ignore[attr-defined]
    return {column.name: getattr(row, column.name) for column in columns}


def _backup_before_reset(
    database_url: str,
    upload_root: Path,
    *,
    pool_size: int,
    max_overflow: int,
    pool_timeout: float,
) -> Path:
    """Snapshot rows about to be deleted and every upload binary.

    Writes ``rows.json`` (images, measurements and their cascaded
    segmentation results) and copies the upload tree into a fresh,
    timestamped directory under ``var/backups/``. Returns that directory.
    """
    from nanodb.persistence.database import create_session_factory, session_scope
    from nanodb.persistence.models import (
        ImageModel,
        MeasurementModel,
        SegmentationResultModel,
    )
    from sqlalchemy import select

    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = BACKUP_ROOT / f"reset-{stamp}"
    if backup_dir.exists():
        raise ResetGuardError(f"backup directory already exists: {backup_dir}")
    backup_dir.mkdir(parents=True, exist_ok=False)

    _, session_factory = create_session_factory(
        database_url,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
    )
    with session_scope(session_factory) as session:
        snapshot = {
            "images": [
                _row_to_dict(row)
                for row in session.scalars(select(ImageModel)).all()
            ],
            "measurements": [
                _row_to_dict(row)
                for row in session.scalars(select(MeasurementModel)).all()
            ],
            "segmentation_results": [
                _row_to_dict(row)
                for row in session.scalars(select(SegmentationResultModel)).all()
            ],
        }
    (backup_dir / "rows.json").write_text(
        json.dumps(snapshot, indent=2, default=str, ensure_ascii=False),
        encoding="utf-8",
    )

    if upload_root.exists():
        shutil.copytree(upload_root, backup_dir / "uploads")

    counts = {name: len(rows) for name, rows in snapshot.items()}
    print(
        f"Backup written to {backup_dir}: "
        + ", ".join(f"{count} {name}" for name, count in counts.items())
        + ", upload binaries copied."
    )
    return backup_dir


def _clear_database(
    database_url: str,
    *,
    pool_size: int,
    max_overflow: int,
    pool_timeout: float,
) -> tuple[int, int]:
    from nanodb.persistence.database import create_session_factory, session_scope
    from nanodb.persistence.models import ImageModel, MeasurementModel
    from sqlalchemy import delete, func, select

    _, session_factory = create_session_factory(
        database_url,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
    )
    with session_scope(session_factory) as session:
        # Measurements first: the foreign key to images uses ON DELETE
        # RESTRICT, so images cannot go until their rows are gone.
        session.execute(delete(MeasurementModel))
        session.execute(delete(ImageModel))
        session.flush()
        image_count = session.scalar(select(func.count(ImageModel.id))) or 0
        measurement_count = session.scalar(select(func.count(MeasurementModel.id))) or 0
    return int(image_count), int(measurement_count)


def reset(*, confirmed: bool, backup: bool = True) -> int:
    from nanodb.settings import Settings

    explicit_profile = os.environ.get("NANODB_PROFILE")
    if explicit_profile != "demo":
        raise ResetGuardError(
            "demo reset requires an explicit NANODB_PROFILE=demo "
            f"(current: {explicit_profile!r})"
        )
    settings = Settings()
    upload_root = _assert_safe_upload_root(settings.upload_root)

    print(f"Target database: {settings.database_url}")
    print(f"Target upload root: {upload_root}")
    if not confirmed:
        raise ResetGuardError("refusing to reset without explicit --yes confirmation")

    if backup:
        _backup_before_reset(
            settings.database_url,
            upload_root,
            pool_size=settings.database_pool_size,
            max_overflow=settings.database_max_overflow,
            pool_timeout=settings.database_pool_timeout,
        )

    image_count, measurement_count = _clear_database(
        settings.database_url,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_timeout=settings.database_pool_timeout,
    )
    _clear_directory(upload_root)

    print(
        f"Demo reset complete: {image_count} image(s), "
        f"{measurement_count} measurement(s), upload root emptied."
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset the NANoDB demo state")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="confirm the destructive reset of the printed demo target",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="skip the pre-reset snapshot to var/backups/ (not recommended)",
    )
    args = parser.parse_args()
    try:
        return reset(confirmed=args.yes, backup=not args.no_backup)
    except ResetGuardError as error:
        print(f"ERROR: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

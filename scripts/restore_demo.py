"""Restore a NANoDB demo snapshot produced by ``reset_demo.py``.

Each reset writes ``var/backups/reset-<timestamp>/`` containing ``rows.json``
(the deleted images, measurements and cascaded segmentation results) and an
``uploads/`` copy of every binary. This tool puts both back.

Like the reset it mirrors, it is guarded:

- ``NANODB_PROFILE`` must be ``demo``.
- an explicit ``--yes`` confirmation is required (the resolved backup, target
  database and upload root are printed first).
- the target database must be empty of images/measurements/segmentation rows
  unless ``--force`` is passed, so a restore never silently collides with
  existing data.

The upload root is repopulated from the snapshot; existing binaries with the
same name are overwritten. Primary-key sequences are advanced past the
restored rows so later inserts do not collide.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_UPLOAD_ROOT = PROJECT_ROOT / "var" / "uploads"
BACKUP_ROOT = PROJECT_ROOT / "var" / "backups"

# Make the backend package importable when run standalone from the project root.
_BACKEND_ROOT = str(PROJECT_ROOT / "src" / "backend")
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)


class RestoreError(RuntimeError):
    """Raised when a restore target or snapshot fails a safety check."""


def _resolve_backup_dir(requested: str | None) -> Path:
    if requested is not None:
        backup_dir = Path(requested)
        if not backup_dir.is_absolute():
            backup_dir = (PROJECT_ROOT / backup_dir).resolve()
    else:
        candidates = sorted(BACKUP_ROOT.glob("reset-*"))
        if not candidates:
            raise RestoreError(f"no backups found under {BACKUP_ROOT}")
        backup_dir = candidates[-1].resolve()
    if not (backup_dir / "rows.json").is_file():
        raise RestoreError(f"not a valid backup (missing rows.json): {backup_dir}")
    return backup_dir


def _coerce_row(model: type, row: dict[str, object]) -> dict[str, object]:
    """Turn JSON scalars back into the column python types (datetimes)."""
    from sqlalchemy import DateTime

    coerced: dict[str, object] = {}
    columns = model.__table__.columns  # type: ignore[attr-defined]
    for column in columns:
        if column.name not in row:
            continue
        value = row[column.name]
        if isinstance(value, str) and isinstance(column.type, DateTime):
            value = datetime.fromisoformat(value)
        coerced[column.name] = value
    return coerced


def _restore_database(
    database_url: str,
    snapshot: dict[str, list[dict[str, object]]],
    *,
    force: bool,
    pool_size: int,
    max_overflow: int,
    pool_timeout: float,
) -> dict[str, int]:
    from nanodb.persistence.database import create_session_factory, session_scope
    from nanodb.persistence.models import (
        ImageModel,
        MeasurementModel,
        SegmentationResultModel,
    )
    from sqlalchemy import func, select, text

    # Parents before children: measurements and segmentation results both
    # carry a foreign key to images.
    ordered = [
        ("images", ImageModel),
        ("measurements", MeasurementModel),
        ("segmentation_results", SegmentationResultModel),
    ]

    _, session_factory = create_session_factory(
        database_url,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
    )
    inserted: dict[str, int] = {}
    with session_scope(session_factory) as session:
        if not force:
            existing = {
                name: session.scalar(select(func.count()).select_from(model)) or 0
                for name, model in ordered
            }
            collisions = {name: n for name, n in existing.items() if n}
            if collisions:
                raise RestoreError(
                    "target database is not empty "
                    f"({collisions}); pass --force to restore anyway"
                )

        for name, model in ordered:
            rows = snapshot.get(name, [])
            for raw in rows:
                session.merge(model(**_coerce_row(model, raw)))
            inserted[name] = len(rows)
        session.flush()

        # Advance each primary-key sequence past the restored ids so future
        # inserts do not collide with them.
        for _, model in ordered:
            table = model.__tablename__
            session.execute(
                text(
                    "SELECT setval(pg_get_serial_sequence(:t, 'id'), "
                    "GREATEST((SELECT COALESCE(MAX(id), 0) FROM "
                    f"{table}), 1))"
                ),
                {"t": table},
            )
    return inserted


def _restore_uploads(backup_dir: Path, upload_root: Path) -> int:
    source = backup_dir / "uploads"
    if not source.is_dir():
        return 0
    upload_root.mkdir(parents=True, exist_ok=True)
    copied = 0
    for entry in source.iterdir():
        target = upload_root / entry.name
        if entry.is_dir():
            shutil.copytree(entry, target, dirs_exist_ok=True)
            copied += sum(1 for _ in entry.rglob("*") if _.is_file())
        else:
            shutil.copy2(entry, target)
            copied += 1
    return copied


def restore(*, backup: str | None, confirmed: bool, force: bool) -> int:
    from nanodb.settings import Settings

    explicit_profile = os.environ.get("NANODB_PROFILE")
    if explicit_profile != "demo":
        raise RestoreError(
            "demo restore requires an explicit NANODB_PROFILE=demo "
            f"(current: {explicit_profile!r})"
        )
    settings = Settings()
    upload_root = settings.upload_root.resolve()
    if upload_root != EXPECTED_UPLOAD_ROOT.resolve():
        raise RestoreError(
            f"upload root must match the dedicated demo target: "
            f"{EXPECTED_UPLOAD_ROOT.resolve()}"
        )

    backup_dir = _resolve_backup_dir(backup)
    snapshot = json.loads((backup_dir / "rows.json").read_text(encoding="utf-8"))

    print(f"Backup: {backup_dir}")
    print(f"Target database: {settings.database_url}")
    print(f"Target upload root: {upload_root}")
    if not confirmed:
        raise RestoreError("refusing to restore without explicit --yes confirmation")

    inserted = _restore_database(
        settings.database_url,
        snapshot,
        force=force,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_timeout=settings.database_pool_timeout,
    )
    copied = _restore_uploads(backup_dir, upload_root)

    print(
        "Restore complete: "
        + ", ".join(f"{count} {name}" for name, count in inserted.items())
        + f", {copied} upload file(s) copied."
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore a NANoDB demo snapshot")
    parser.add_argument(
        "backup",
        nargs="?",
        default=None,
        help="backup directory under var/backups/ (defaults to the newest)",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="confirm the restore into the printed demo target",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="restore even when the target database already has rows",
    )
    args = parser.parse_args()
    try:
        return restore(backup=args.backup, confirmed=args.yes, force=args.force)
    except RestoreError as error:
        print(f"ERROR: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

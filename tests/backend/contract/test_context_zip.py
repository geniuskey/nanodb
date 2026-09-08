from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime
from io import BytesIO
from zipfile import ZipFile

import pytest
from nanodb.domain.calculations import build_expected_summary
from nanodb.domain.entities import (
    ExportSnapshot,
    Image,
    Measurement,
    MeasurementType,
    Point,
)
from nanodb.services.export_builder import ENTRY_NAMES, build_context_zip

NOW = datetime(2026, 9, 8, 3, 0, tzinfo=UTC)


@pytest.fixture
def snapshot() -> ExportSnapshot:
    image = Image(
        id=7,
        original_filename="측정 & sample.png",
        stored_filename="must-not-export.png",
        image_type="TEM",
        product_id="PRODUCT-01",
        lot_id="LOT-01",
        wafer_id="WAFER-01",
        process_step="식각 & 세정",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
        created_at=NOW,
    )
    measurements = (
        Measurement(
            id=1,
            image_id=7,
            item_id=None,
            measurement_type=MeasurementType.LENGTH,
            points=(Point(100, 100), Point(400, 500)),
            value=100,
            unit="nm",
            calibration_nm_per_pixel=0.2,
            label="홀 <경계>",
            note="한글 메모 <>&",
            created_at=NOW,
        ),
    )
    return ExportSnapshot(
        schema_version="3.0",
        exported_at=NOW,
        image=image,
        measurements=measurements,
        expected_summary=build_expected_summary(measurements),
    )


def read_archive(content: bytes) -> dict[str, str]:
    with ZipFile(BytesIO(content)) as archive:
        assert tuple(archive.namelist()) == ENTRY_NAMES
        return {name: archive.read(name).decode("utf-8") for name in ENTRY_NAMES}


def test_zip_has_fixed_utf8_entries_and_allowlisted_fields(
    snapshot: ExportSnapshot,
) -> None:
    entries = read_archive(build_context_zip(snapshot))
    data = json.loads(entries["data.json"])
    checks = json.loads(entries["checks.json"])

    measurement = data["measurements"][0]
    assert measurement["note"] == "한글 메모 <>&"
    assert "stored_filename" not in entries["data.json"]
    assert "must-not-export.png" not in "".join(entries.values())
    assert measurement["measurement_type"] == "length"
    assert measurement["points"] == [[100, 100], [400, 500]]
    assert measurement["value"] == 100
    assert measurement["unit"] == "nm"
    assert measurement["measurement_method"] == "manual"
    assert measurement["reference_status"] == "unreviewed"
    assert checks["expected_summary"] == [
        {"measurement_type": "length", "unit": "nm", "count": 1, "mean": 100.0}
    ]
    assert checks["synthetic_calculation"]["expected_distance_px"] == 500


def test_same_snapshot_produces_identical_zip_bytes(snapshot: ExportSnapshot) -> None:
    assert build_context_zip(snapshot) == build_context_zip(snapshot)


def test_annotation_travels_with_the_measurement_it_describes(
    snapshot: ExportSnapshot,
) -> None:
    entries = read_archive(build_context_zip(snapshot))
    data = json.loads(entries["data.json"])

    measurement = data["measurements"][0]
    # Korean text and special characters survive the JSON round trip.
    assert measurement["label"] == "홀 <경계>"
    assert measurement["note"] == "한글 메모 <>&"
    assert data["image"]["process_step"] == "식각 & 세정"

    # The consuming AI is told what the two free-text fields mean, so it can no
    # longer be instructed to ignore them.
    assert "label names what was measured" in entries["context.md"]
    assert "ignore" not in entries["task.md"]
    assert "not by the free-text label" in entries["task.md"]


def test_annotation_is_a_caption_and_never_reaches_the_summary(
    snapshot: ExportSnapshot,
) -> None:
    entries = read_archive(build_context_zip(snapshot))
    checks = json.loads(entries["checks.json"])

    # Grouping is by measurement_type; the label is a caption, not a category.
    assert checks["expected_summary"] == [
        {"measurement_type": "length", "unit": "nm", "count": 1, "mean": 100.0}
    ]
    assert "label" not in entries["checks.json"]
    assert "process_step" not in entries["checks.json"]


def test_unannotated_measurement_exports_null_rather_than_an_invented_name(
    snapshot: ExportSnapshot,
) -> None:
    bare = replace(
        snapshot,
        image=replace(snapshot.image, process_step=None),
        measurements=(replace(snapshot.measurements[0], label=None, note=None),),
    )

    data = json.loads(read_archive(build_context_zip(bare))["data.json"])

    # The keys are always present, so a consumer never has to branch on absence.
    assert data["measurements"][0]["label"] is None
    assert data["measurements"][0]["note"] is None
    assert data["image"]["process_step"] is None

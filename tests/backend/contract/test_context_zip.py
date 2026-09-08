from __future__ import annotations

import json
from datetime import UTC, datetime
from io import BytesIO
from zipfile import ZipFile

import pytest
from nanodb.domain.calculations import build_expected_summary
from nanodb.domain.entities import (
    ExportSnapshot,
    Image,
    ImageType,
    Measurement,
    ParameterType,
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
        image_type=ImageType.TEM,
        product_id="PRODUCT-01",
        lot_id="LOT-01",
        wafer_id="WAFER-01",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
        created_at=NOW,
    )
    measurements = (
        Measurement(
            id=1,
            image_id=7,
            parameter_type=ParameterType.CD,
            start=Point(100, 100),
            end=Point(400, 500),
            distance_px=500,
            calibration_nm_per_pixel=0.2,
            value_nm=100,
            note="한글 메모 <>&",
            created_at=NOW,
        ),
    )
    return ExportSnapshot(
        schema_version="1.0",
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

    assert data["measurements"][0]["note"] == "한글 메모 <>&"
    assert "stored_filename" not in entries["data.json"]
    assert "must-not-export.png" not in "".join(entries.values())
    assert data["measurements"][0]["measurement_method"] == "manual_two_point"
    assert data["measurements"][0]["reference_status"] == "unreviewed"
    assert checks["expected_summary"] == [
        {"parameter_type": "CD", "count": 1, "mean_nm": 100.0}
    ]
    assert checks["synthetic_calculation"]["expected_distance_px"] == 500


def test_same_snapshot_produces_identical_zip_bytes(snapshot: ExportSnapshot) -> None:
    assert build_context_zip(snapshot) == build_context_zip(snapshot)

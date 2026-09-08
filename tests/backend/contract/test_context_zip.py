from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime
from io import BytesIO
from zipfile import ZipFile

import pytest
from nanodb.domain.calculations import build_expected_summary
from nanodb.domain.entities import (
    Annotation,
    ExportSnapshot,
    Image,
    ImageType,
    Measurement,
    ParameterType,
    Point,
    ProductType,
    ShapeKind,
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
    annotations = (
        Annotation(
            id=3,
            image_id=7,
            kind=ShapeKind.CIRCLE,
            start=Point(200, 200),
            end=Point(260, 200),
            product=ProductType.SENSOR,
            step="식각 & 세정",
            measurement_name="홀 <경계>",
            created_at=NOW,
        ),
    )
    return ExportSnapshot(
        schema_version="1.1",
        exported_at=NOW,
        image=image,
        measurements=measurements,
        expected_summary=build_expected_summary(measurements),
        annotations=annotations,
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


def test_annotations_travel_with_their_labels_and_stay_out_of_the_summary(
    snapshot: ExportSnapshot,
) -> None:
    entries = read_archive(build_context_zip(snapshot))
    data = json.loads(entries["data.json"])
    checks = json.loads(entries["checks.json"])

    shape = data["annotations"][0]
    assert shape["kind"] == "circle"
    assert (shape["start_x"], shape["start_y"]) == (200, 200)
    assert (shape["end_x"], shape["end_y"]) == (260, 200)
    assert shape["product"] == "Sensor"
    # Korean text and special characters survive the JSON round trip.
    assert shape["step"] == "식각 & 세정"
    assert shape["measurement_name"] == "홀 <경계>"

    # A shape is a label, not a measured value: it must not reach the summary
    # the generated code is asked to reproduce.
    assert checks["expected_summary"] == [
        {"parameter_type": "CD", "count": 1, "mean_nm": 100.0}
    ]
    assert "annotations" not in entries["checks.json"]
    assert "must not be counted in any measurement summary" in entries["context.md"]
    assert "ignore annotations" in entries["task.md"]


def test_export_without_shapes_carries_an_empty_annotation_list(
    snapshot: ExportSnapshot,
) -> None:
    bare = replace(snapshot, annotations=())

    data = json.loads(read_archive(build_context_zip(bare))["data.json"])

    # The key is always present, so a consumer never has to branch on absence.
    assert data["annotations"] == []

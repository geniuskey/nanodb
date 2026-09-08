from __future__ import annotations

import math
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from nanodb.domain.calculations import (
    build_expected_summary,
    calculate_measurement,
    round_for_display,
    validate_export_snapshot,
)
from nanodb.domain.entities import (
    ExportSnapshot,
    Image,
    Measurement,
    ParameterType,
    Point,
)
from nanodb.domain.errors import DomainError

NOW = datetime(2026, 9, 8, tzinfo=UTC)


def make_image(*, image_id: int = 1) -> Image:
    return Image(
        id=image_id,
        original_filename="측정 이미지.png",
        stored_filename="8af4a44f.png",
        image_type="TEM",
        product_id="PRODUCT-01",
        lot_id="LOT-01",
        wafer_id="WAFER-01",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
        created_at=NOW,
    )


def make_measurement(
    measurement_id: int,
    parameter_type: ParameterType,
    value_nm: float,
    *,
    image_id: int = 1,
    start: Point | None = None,
    end: Point | None = None,
    calibration: float = 0.2,
) -> Measurement:
    resolved_start = start or Point(0, 0)
    resolved_end = end or Point(value_nm / calibration, 0)
    distance_px = math.hypot(
        resolved_end.x - resolved_start.x,
        resolved_end.y - resolved_start.y,
    )
    return Measurement(
        id=measurement_id,
        image_id=image_id,
        parameter_type=parameter_type,
        start=resolved_start,
        end=resolved_end,
        distance_px=distance_px,
        calibration_nm_per_pixel=calibration,
        value_nm=value_nm,
        label="게이트 상단",
        note="한글 메모 & symbols <>",
        created_at=NOW,
    )


def test_known_500_pixel_case_is_100_nm() -> None:
    result = calculate_measurement(
        Point(100, 100),
        Point(400, 500),
        0.2,
        pixel_width=1000,
        pixel_height=800,
    )

    assert result.distance_px == 500
    assert result.value_nm == 100


@pytest.mark.parametrize(
    ("start", "end", "expected_field"),
    [
        (Point(-0.01, 0), Point(1, 1), "start"),
        (Point(0, -0.01), Point(1, 1), "start"),
        (Point(0, 0), Point(1000, 1), "end"),
        (Point(0, 0), Point(1, 800), "end"),
    ],
)
def test_points_outside_original_bounds_are_rejected(
    start: Point,
    end: Point,
    expected_field: str,
) -> None:
    with pytest.raises(DomainError) as caught:
        calculate_measurement(
            start,
            end,
            0.2,
            pixel_width=1000,
            pixel_height=800,
        )

    assert caught.value.code == "POINT_OUT_OF_BOUNDS"
    assert caught.value.field == expected_field


@pytest.mark.parametrize("bad_value", [math.nan, math.inf, -math.inf])
def test_non_finite_coordinates_are_rejected(bad_value: float) -> None:
    with pytest.raises(DomainError, match="finite") as caught:
        calculate_measurement(
            Point(bad_value, 0),
            Point(1, 1),
            0.2,
            pixel_width=1000,
            pixel_height=800,
        )

    assert caught.value.code == "NON_FINITE_NUMBER"


@pytest.mark.parametrize("calibration", [0, -0.2, math.nan, math.inf])
def test_non_positive_or_non_finite_calibration_is_rejected(
    calibration: float,
) -> None:
    with pytest.raises(DomainError):
        calculate_measurement(
            Point(0, 0),
            Point(1, 1),
            calibration,
            pixel_width=1000,
            pixel_height=800,
        )


def test_identical_points_are_rejected() -> None:
    with pytest.raises(DomainError) as caught:
        calculate_measurement(
            Point(10, 10),
            Point(10, 10),
            0.2,
            pixel_width=1000,
            pixel_height=800,
        )

    assert caught.value.code == "IDENTICAL_POINTS"


def test_display_rounding_is_decimal_half_up_without_changing_source() -> None:
    stored = 12.345

    displayed = round_for_display(stored)

    assert displayed == Decimal("12.35")
    assert stored == 12.345


def test_expected_summary_uses_contract_order_and_stored_precision() -> None:
    measurements = (
        make_measurement(1, ParameterType.DEPTH, 30),
        make_measurement(2, ParameterType.CD, 10),
        make_measurement(3, ParameterType.CD, 20),
    )

    summary = build_expected_summary(measurements)

    assert [(row.parameter_type, row.count, row.mean_nm) for row in summary] == [
        (ParameterType.CD, 2, 15),
        (ParameterType.DEPTH, 1, 30),
    ]


def test_valid_export_snapshot_accepts_id_ordered_single_image_data() -> None:
    image = make_image()
    measurements = (
        make_measurement(1, ParameterType.CD, 10),
        make_measurement(2, ParameterType.DEPTH, 30),
    )
    snapshot = ExportSnapshot(
        schema_version="1.0",
        exported_at=NOW,
        image=image,
        measurements=measurements,
        expected_summary=build_expected_summary(measurements),
    )

    validate_export_snapshot(snapshot)


def test_export_requires_at_least_one_measurement() -> None:
    snapshot = ExportSnapshot(
        schema_version="1.0",
        exported_at=NOW,
        image=make_image(),
        measurements=(),
        expected_summary=(),
    )

    with pytest.raises(DomainError) as caught:
        validate_export_snapshot(snapshot)

    assert caught.value.code == "NO_MEASUREMENTS"


def test_export_rejects_mixed_images() -> None:
    measurements = (make_measurement(1, ParameterType.CD, 10, image_id=2),)
    snapshot = ExportSnapshot(
        schema_version="1.0",
        exported_at=NOW,
        image=make_image(image_id=1),
        measurements=measurements,
        expected_summary=build_expected_summary(measurements),
    )

    with pytest.raises(DomainError) as caught:
        validate_export_snapshot(snapshot)

    assert caught.value.code == "MIXED_IMAGE_EXPORT"


def test_export_rejects_non_deterministic_measurement_order() -> None:
    measurements = (
        make_measurement(2, ParameterType.DEPTH, 30),
        make_measurement(1, ParameterType.CD, 10),
    )
    snapshot = ExportSnapshot(
        schema_version="1.0",
        exported_at=NOW,
        image=make_image(),
        measurements=measurements,
        expected_summary=build_expected_summary(measurements),
    )

    with pytest.raises(DomainError) as caught:
        validate_export_snapshot(snapshot)

    assert caught.value.code == "INVALID_MEASUREMENT_ORDER"


def test_export_rejects_tampered_calculated_value() -> None:
    measurement = make_measurement(1, ParameterType.CD, 10)
    tampered = Measurement(
        id=measurement.id,
        image_id=measurement.image_id,
        parameter_type=measurement.parameter_type,
        start=measurement.start,
        end=measurement.end,
        distance_px=measurement.distance_px,
        calibration_nm_per_pixel=measurement.calibration_nm_per_pixel,
        value_nm=11,
        label=measurement.label,
        note=measurement.note,
        created_at=measurement.created_at,
    )
    snapshot = ExportSnapshot(
        schema_version="1.0",
        exported_at=NOW,
        image=make_image(),
        measurements=(tampered,),
        expected_summary=build_expected_summary((tampered,)),
    )

    with pytest.raises(DomainError) as caught:
        validate_export_snapshot(snapshot)

    assert caught.value.code == "INCONSISTENT_MEASUREMENT"

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
    MeasurementType,
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


def make_length(
    measurement_id: int,
    value_nm: float,
    *,
    image_id: int = 1,
    calibration: float = 0.2,
) -> Measurement:
    """A length measurement whose points reproduce ``value_nm`` at ``calibration``."""
    points = (Point(0, 0), Point(value_nm / calibration, 0))
    return Measurement(
        id=measurement_id,
        image_id=image_id,
        item_id=None,
        measurement_type=MeasurementType.LENGTH,
        points=points,
        value=value_nm,
        unit="nm",
        calibration_nm_per_pixel=calibration,
        label="게이트 상단",
        note="한글 메모 & symbols <>",
        created_at=NOW,
    )


def test_known_500_pixel_length_is_100_nm() -> None:
    result = calculate_measurement(
        MeasurementType.LENGTH,
        (Point(100, 100), Point(400, 500)),
        0.2,
        pixel_width=1000,
        pixel_height=800,
    )

    assert result.value == 100
    assert result.unit == "nm"


def test_right_angle_of_three_points_is_ninety_degrees() -> None:
    result = calculate_measurement(
        MeasurementType.ANGLE,
        (Point(100, 100), Point(200, 100), Point(100, 200)),
        0.2,
        pixel_width=1000,
        pixel_height=800,
    )

    assert result.value == pytest.approx(90.0)
    assert result.unit == "deg"


def test_curvature_fits_the_circle_radius_in_nm() -> None:
    # Three points on a circle of radius 100px centred at (100, 100).
    result = calculate_measurement(
        MeasurementType.CURVATURE,
        (Point(200, 100), Point(100, 200), Point(0, 100)),
        0.2,
        pixel_width=1000,
        pixel_height=800,
    )

    assert result.value == pytest.approx(100 * 0.2)
    assert result.unit == "nm"


@pytest.mark.parametrize(
    ("points", "expected_index"),
    [
        ((Point(-0.01, 0), Point(1, 1)), 0),
        ((Point(0, -0.01), Point(1, 1)), 0),
        ((Point(0, 0), Point(1000, 1)), 1),
        ((Point(0, 0), Point(1, 800)), 1),
    ],
)
def test_points_outside_original_bounds_are_rejected(
    points: tuple[Point, Point],
    expected_index: int,
) -> None:
    with pytest.raises(DomainError) as caught:
        calculate_measurement(
            MeasurementType.LENGTH,
            points,
            0.2,
            pixel_width=1000,
            pixel_height=800,
        )

    assert caught.value.code == "POINT_OUT_OF_BOUNDS"
    assert caught.value.field == f"points[{expected_index}]"


@pytest.mark.parametrize("bad_value", [math.nan, math.inf, -math.inf])
def test_non_finite_coordinates_are_rejected(bad_value: float) -> None:
    with pytest.raises(DomainError, match="finite") as caught:
        calculate_measurement(
            MeasurementType.LENGTH,
            (Point(bad_value, 0), Point(1, 1)),
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
            MeasurementType.LENGTH,
            (Point(0, 0), Point(1, 1)),
            calibration,
            pixel_width=1000,
            pixel_height=800,
        )


def test_wrong_point_count_is_rejected() -> None:
    with pytest.raises(DomainError) as caught:
        calculate_measurement(
            MeasurementType.ANGLE,
            (Point(0, 0), Point(1, 1)),
            0.2,
            pixel_width=1000,
            pixel_height=800,
        )

    assert caught.value.code == "INVALID_POINT_COUNT"


def test_identical_length_points_are_rejected() -> None:
    with pytest.raises(DomainError) as caught:
        calculate_measurement(
            MeasurementType.LENGTH,
            (Point(10, 10), Point(10, 10)),
            0.2,
            pixel_width=1000,
            pixel_height=800,
        )

    assert caught.value.code == "IDENTICAL_POINTS"


def test_degenerate_angle_arm_is_rejected() -> None:
    with pytest.raises(DomainError) as caught:
        calculate_measurement(
            MeasurementType.ANGLE,
            (Point(100, 100), Point(100, 100), Point(200, 200)),
            0.2,
            pixel_width=1000,
            pixel_height=800,
        )

    assert caught.value.code == "DEGENERATE_ANGLE"


def test_collinear_curvature_points_are_rejected() -> None:
    with pytest.raises(DomainError) as caught:
        calculate_measurement(
            MeasurementType.CURVATURE,
            (Point(0, 0), Point(100, 100), Point(200, 200)),
            0.2,
            pixel_width=1000,
            pixel_height=800,
        )

    assert caught.value.code == "COLLINEAR_POINTS"


def test_display_rounding_is_decimal_half_up_without_changing_source() -> None:
    stored = 12.345

    displayed = round_for_display(stored)

    assert displayed == Decimal("12.35")
    assert stored == 12.345


def test_expected_summary_uses_contract_order_and_stored_precision() -> None:
    measurements = (
        make_length(1, 10),
        make_length(2, 20),
    )

    summary = build_expected_summary(measurements)

    rows = [(row.measurement_type, row.unit, row.count, row.mean) for row in summary]
    assert rows == [(MeasurementType.LENGTH, "nm", 2, 15)]


def test_valid_export_snapshot_accepts_id_ordered_single_image_data() -> None:
    image = make_image()
    measurements = (
        make_length(1, 10),
        make_length(2, 30),
    )
    snapshot = ExportSnapshot(
        schema_version="3.0",
        exported_at=NOW,
        image=image,
        measurements=measurements,
        expected_summary=build_expected_summary(measurements),
    )

    validate_export_snapshot(snapshot)


def test_export_requires_at_least_one_measurement() -> None:
    snapshot = ExportSnapshot(
        schema_version="3.0",
        exported_at=NOW,
        image=make_image(),
        measurements=(),
        expected_summary=(),
    )

    with pytest.raises(DomainError) as caught:
        validate_export_snapshot(snapshot)

    assert caught.value.code == "NO_MEASUREMENTS"


def test_export_rejects_mixed_images() -> None:
    measurements = (make_length(1, 10, image_id=2),)
    snapshot = ExportSnapshot(
        schema_version="3.0",
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
        make_length(2, 30),
        make_length(1, 10),
    )
    snapshot = ExportSnapshot(
        schema_version="3.0",
        exported_at=NOW,
        image=make_image(),
        measurements=measurements,
        expected_summary=build_expected_summary(measurements),
    )

    with pytest.raises(DomainError) as caught:
        validate_export_snapshot(snapshot)

    assert caught.value.code == "INVALID_MEASUREMENT_ORDER"


def test_export_rejects_tampered_calculated_value() -> None:
    measurement = make_length(1, 10)
    tampered = Measurement(
        id=measurement.id,
        image_id=measurement.image_id,
        item_id=measurement.item_id,
        measurement_type=measurement.measurement_type,
        points=measurement.points,
        value=11,
        unit=measurement.unit,
        calibration_nm_per_pixel=measurement.calibration_nm_per_pixel,
        label=measurement.label,
        note=measurement.note,
        created_at=measurement.created_at,
    )
    snapshot = ExportSnapshot(
        schema_version="3.0",
        exported_at=NOW,
        image=make_image(),
        measurements=(tampered,),
        expected_summary=build_expected_summary((tampered,)),
    )

    with pytest.raises(DomainError) as caught:
        validate_export_snapshot(snapshot)

    assert caught.value.code == "INCONSISTENT_MEASUREMENT"

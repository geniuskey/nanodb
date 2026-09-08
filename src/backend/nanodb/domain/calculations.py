"""Pure NANoDB calculations and snapshot validation."""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from nanodb.domain.entities import (
    ExpectedSummaryEntry,
    ExportSnapshot,
    Measurement,
    ParameterType,
    Point,
)
from nanodb.domain.errors import DomainError


@dataclass(frozen=True, slots=True)
class MeasurementCalculation:
    distance_px: float
    value_nm: float


def _require_finite(value: float, field: str) -> None:
    if not math.isfinite(value):
        raise DomainError(
            "NON_FINITE_NUMBER",
            f"{field} must be a finite number.",
            field=field,
        )


def _validate_point(
    point: Point,
    *,
    pixel_width: int,
    pixel_height: int,
    field: str,
) -> None:
    _require_finite(point.x, f"{field}.x")
    _require_finite(point.y, f"{field}.y")
    if not (0 <= point.x < pixel_width and 0 <= point.y < pixel_height):
        raise DomainError(
            "POINT_OUT_OF_BOUNDS",
            f"{field} must be inside the original image bounds.",
            field=field,
        )


def calculate_measurement(
    start: Point,
    end: Point,
    calibration_nm_per_pixel: float,
    *,
    pixel_width: int,
    pixel_height: int,
) -> MeasurementCalculation:
    """Validate original points and calculate distance using server inputs."""
    if pixel_width <= 0 or pixel_height <= 0:
        raise DomainError(
            "INVALID_IMAGE_DIMENSIONS",
            "Image dimensions must be positive integers.",
        )
    _require_finite(calibration_nm_per_pixel, "calibration_nm_per_pixel")
    if calibration_nm_per_pixel <= 0:
        raise DomainError(
            "INVALID_CALIBRATION",
            "Calibration must be greater than zero.",
            field="calibration_nm_per_pixel",
        )
    _validate_point(
        start,
        pixel_width=pixel_width,
        pixel_height=pixel_height,
        field="start",
    )
    _validate_point(
        end,
        pixel_width=pixel_width,
        pixel_height=pixel_height,
        field="end",
    )
    if start == end:
        raise DomainError(
            "IDENTICAL_POINTS",
            "Start and end points must be different.",
            field="end",
        )

    distance_px = math.hypot(end.x - start.x, end.y - start.y)
    value_nm = distance_px * calibration_nm_per_pixel
    if not math.isfinite(distance_px) or not math.isfinite(value_nm):
        raise DomainError(
            "INVALID_MEASUREMENT_RESULT",
            "Calculated measurement must be finite.",
        )
    if distance_px <= 0 or value_nm <= 0:
        raise DomainError(
            "INVALID_MEASUREMENT_RESULT",
            "Calculated measurement must be greater than zero.",
        )
    return MeasurementCalculation(distance_px=distance_px, value_nm=value_nm)


def round_for_display(value: float, digits: int = 2) -> Decimal:
    """Return decimal half-up output without mutating the stored float."""
    _require_finite(value, "value")
    if digits < 0:
        raise DomainError(
            "INVALID_ROUNDING_DIGITS",
            "Rounding digits must be zero or greater.",
            field="digits",
        )
    quantum = Decimal(1).scaleb(-digits)
    return Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP)


def build_expected_summary(
    measurements: Iterable[Measurement],
) -> tuple[ExpectedSummaryEntry, ...]:
    """Aggregate in the fixed CD, Depth, Thickness contract order."""
    grouped: dict[ParameterType, list[float]] = {
        parameter_type: [] for parameter_type in ParameterType
    }
    for measurement in measurements:
        _require_finite(measurement.value_nm, "measurement.value_nm")
        if measurement.value_nm <= 0:
            raise DomainError(
                "INVALID_MEASUREMENT_VALUE",
                "Measurement values must be greater than zero.",
            )
        grouped[measurement.parameter_type].append(measurement.value_nm)

    return tuple(
        ExpectedSummaryEntry(
            parameter_type=parameter_type,
            count=len(values),
            mean_nm=math.fsum(values) / len(values),
        )
        for parameter_type in ParameterType
        if (values := grouped[parameter_type])
    )


def validate_export_snapshot(snapshot: ExportSnapshot) -> None:
    """Validate the selected-image-only export contract."""
    if not snapshot.schema_version.strip():
        raise DomainError("INVALID_SCHEMA_VERSION", "Schema version is required.")
    if not snapshot.measurements:
        raise DomainError(
            "NO_MEASUREMENTS",
            "At least one saved measurement is required for export.",
        )

    ordered_ids = [measurement.id for measurement in snapshot.measurements]
    if ordered_ids != sorted(ordered_ids):
        raise DomainError(
            "INVALID_MEASUREMENT_ORDER",
            "Export measurements must be ordered by ID.",
        )

    for measurement in snapshot.measurements:
        if measurement.image_id != snapshot.image.id:
            raise DomainError(
                "MIXED_IMAGE_EXPORT",
                "Every measurement must belong to the selected image.",
            )
        calculation = calculate_measurement(
            measurement.start,
            measurement.end,
            measurement.calibration_nm_per_pixel,
            pixel_width=snapshot.image.pixel_width,
            pixel_height=snapshot.image.pixel_height,
        )
        if not math.isclose(
            measurement.distance_px,
            calculation.distance_px,
            rel_tol=0,
            abs_tol=1e-9,
        ) or not math.isclose(
            measurement.value_nm,
            calculation.value_nm,
            rel_tol=0,
            abs_tol=1e-9,
        ):
            raise DomainError(
                "INCONSISTENT_MEASUREMENT",
                "Stored measurement values do not match their source coordinates.",
            )

    annotation_ids = [annotation.id for annotation in snapshot.annotations]
    if annotation_ids != sorted(annotation_ids):
        raise DomainError(
            "INVALID_ANNOTATION_ORDER",
            "Export annotations must be ordered by ID.",
        )
    for annotation in snapshot.annotations:
        if annotation.image_id != snapshot.image.id:
            raise DomainError(
                "MIXED_IMAGE_EXPORT",
                "Every annotation must belong to the selected image.",
            )

    if snapshot.expected_summary != build_expected_summary(snapshot.measurements):
        raise DomainError(
            "INCONSISTENT_SUMMARY",
            "Expected summary does not match the measurement snapshot.",
        )

"""Pure NANoDB calculations and snapshot validation."""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from nanodb.domain.entities import (
    UNIT_BY_TYPE,
    ExpectedSummaryEntry,
    ExportSnapshot,
    Measurement,
    MeasurementType,
    Point,
)
from nanodb.domain.errors import DomainError

# Points closer than this (in pixels) are treated as the same click, which
# would make an arm, a segment or a circle fit degenerate.
_MIN_SEPARATION_PX = 1e-6


@dataclass(frozen=True, slots=True)
class MeasurementResult:
    """The server-authoritative result of a drawn measurement."""

    value: float
    unit: str


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


def _validate_geometry(
    measurement_type: MeasurementType,
    points: Sequence[Point],
    calibration_nm_per_pixel: float,
    *,
    pixel_width: int,
    pixel_height: int,
) -> None:
    from nanodb.domain.entities import POINT_COUNT_BY_TYPE

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
    expected = POINT_COUNT_BY_TYPE[measurement_type]
    if len(points) != expected:
        raise DomainError(
            "INVALID_POINT_COUNT",
            f"{measurement_type.value} needs exactly {expected} points.",
            field="points",
        )
    for index, point in enumerate(points):
        _validate_point(
            point,
            pixel_width=pixel_width,
            pixel_height=pixel_height,
            field=f"points[{index}]",
        )


def _distance(a: Point, b: Point) -> float:
    return math.hypot(b.x - a.x, b.y - a.y)


def _calculate_length(points: Sequence[Point], calibration: float) -> float:
    distance_px = _distance(points[0], points[1])
    if distance_px <= _MIN_SEPARATION_PX:
        raise DomainError(
            "IDENTICAL_POINTS",
            "The two points must be different.",
            field="points",
        )
    return distance_px * calibration


def _calculate_angle(points: Sequence[Point]) -> float:
    vertex, arm_a, arm_b = points[0], points[1], points[2]
    ax, ay = arm_a.x - vertex.x, arm_a.y - vertex.y
    bx, by = arm_b.x - vertex.x, arm_b.y - vertex.y
    len_a = math.hypot(ax, ay)
    len_b = math.hypot(bx, by)
    if len_a <= _MIN_SEPARATION_PX or len_b <= _MIN_SEPARATION_PX:
        raise DomainError(
            "DEGENERATE_ANGLE",
            "Each arm must start away from the vertex.",
            field="points",
        )
    cosine = (ax * bx + ay * by) / (len_a * len_b)
    cosine = max(-1.0, min(1.0, cosine))
    return math.degrees(math.acos(cosine))


def _fit_circle_radius_px(points: Sequence[Point]) -> float:
    """Return the circumradius of the three points, in pixels.

    Raises when the points are collinear (no finite circle passes through
    them), which is the only ill-posed case for a three-point fit.
    """
    (x1, y1), (x2, y2), (x3, y3) = (
        (points[0].x, points[0].y),
        (points[1].x, points[1].y),
        (points[2].x, points[2].y),
    )
    # Twice the signed area of the triangle; zero means the points are collinear.
    area2 = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1)
    if abs(area2) <= _MIN_SEPARATION_PX:
        raise DomainError(
            "COLLINEAR_POINTS",
            "The three points must not lie on a straight line.",
            field="points",
        )
    a = _distance(points[0], points[1])
    b = _distance(points[1], points[2])
    c = _distance(points[2], points[0])
    # Circumradius R = (a*b*c) / (4 * area), area = |area2| / 2.
    return (a * b * c) / (2 * abs(area2))


def _calculate_curvature(points: Sequence[Point], calibration: float) -> float:
    return _fit_circle_radius_px(points) * calibration


def calculate_measurement(
    measurement_type: MeasurementType,
    points: Sequence[Point],
    calibration_nm_per_pixel: float,
    *,
    pixel_width: int,
    pixel_height: int,
) -> MeasurementResult:
    """Validate the placed points and compute the value for a measurement type."""
    _validate_geometry(
        measurement_type,
        points,
        calibration_nm_per_pixel,
        pixel_width=pixel_width,
        pixel_height=pixel_height,
    )
    if measurement_type is MeasurementType.LENGTH:
        value = _calculate_length(points, calibration_nm_per_pixel)
    elif measurement_type is MeasurementType.ANGLE:
        value = _calculate_angle(points)
    else:
        value = _calculate_curvature(points, calibration_nm_per_pixel)

    if not math.isfinite(value) or value <= 0:
        raise DomainError(
            "INVALID_MEASUREMENT_RESULT",
            "Calculated measurement must be a finite positive number.",
        )
    return MeasurementResult(value=value, unit=UNIT_BY_TYPE[measurement_type])


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
    """Aggregate mean value per measurement type, in the fixed type order."""
    grouped: dict[MeasurementType, list[float]] = {
        measurement_type: [] for measurement_type in MeasurementType
    }
    for measurement in measurements:
        _require_finite(measurement.value, "measurement.value")
        if measurement.value <= 0:
            raise DomainError(
                "INVALID_MEASUREMENT_VALUE",
                "Measurement values must be greater than zero.",
            )
        grouped[measurement.measurement_type].append(measurement.value)

    return tuple(
        ExpectedSummaryEntry(
            measurement_type=measurement_type,
            unit=UNIT_BY_TYPE[measurement_type],
            count=len(values),
            mean=math.fsum(values) / len(values),
        )
        for measurement_type in MeasurementType
        if (values := grouped[measurement_type])
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
        result = calculate_measurement(
            measurement.measurement_type,
            measurement.points,
            measurement.calibration_nm_per_pixel,
            pixel_width=snapshot.image.pixel_width,
            pixel_height=snapshot.image.pixel_height,
        )
        if (
            not math.isclose(
                measurement.value,
                result.value,
                rel_tol=0,
                abs_tol=1e-9,
            )
            or measurement.unit != result.unit
        ):
            raise DomainError(
                "INCONSISTENT_MEASUREMENT",
                "Stored measurement values do not match their source coordinates.",
            )

    if snapshot.expected_summary != build_expected_summary(snapshot.measurements):
        raise DomainError(
            "INCONSISTENT_SUMMARY",
            "Expected summary does not match the measurement snapshot.",
        )

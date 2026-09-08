"""Framework-independent NANoDB Core domain values."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class CatalogCategory(StrEnum):
    """Managed lookup lists that feed the registration comboboxes.

    ``image_type`` used to be a fixed SEM/TEM enum; it is now a managed list so
    operators can register new imaging modalities without a code change. The
    original SEM/TEM values are seeded as predefined options.
    """

    IMAGE_TYPE = "image_type"
    PRODUCT_ID = "product_id"
    LOT_ID = "lot_id"
    WAFER_ID = "wafer_id"
    PROCESS_STEP = "process_step"


class MeasurementType(StrEnum):
    """How a measurement is drawn on the image and what its value means.

    - ``LENGTH``: a line segment between two points; value is nanometres.
    - ``ANGLE``: three points (vertex first, then the two arm ends); value is
      the angle at the vertex in degrees.
    - ``CURVATURE``: three points on an arc; a circle is fitted through them and
      the value is the fitted radius in nanometres.
    """

    LENGTH = "length"
    ANGLE = "angle"
    CURVATURE = "curvature"


# Unit each measurement type reports its value in.
UNIT_BY_TYPE: dict[MeasurementType, str] = {
    MeasurementType.LENGTH: "nm",
    MeasurementType.ANGLE: "deg",
    MeasurementType.CURVATURE: "nm",
}

# How many points the operator places for each measurement type.
POINT_COUNT_BY_TYPE: dict[MeasurementType, int] = {
    MeasurementType.LENGTH: 2,
    MeasurementType.ANGLE: 3,
    MeasurementType.CURVATURE: 3,
}


class ReferenceStatus(StrEnum):
    UNREVIEWED = "unreviewed"


@dataclass(frozen=True, slots=True)
class Point:
    x: float
    y: float


@dataclass(frozen=True, slots=True)
class Image:
    id: int
    original_filename: str
    stored_filename: str
    image_type: str
    product_id: str
    lot_id: str
    wafer_id: str
    calibration_nm_per_pixel: float
    pixel_width: int
    pixel_height: int
    created_at: datetime
    # Browser-renderable derivative (PNG) for formats an <img> cannot display
    # natively (e.g. TIFF). None means the original is served directly.
    display_filename: str | None = None
    # Process step the image was taken at (e.g. "Gate Etch"). Optional free
    # text: it describes the whole image, never an individual measurement.
    process_step: str | None = None


@dataclass(frozen=True, slots=True)
class MeasurementItem:
    """A named, reusable measurement definition scoped to one product.

    ``name`` is what the operator is measuring (e.g. "Gate CD") and
    ``measurement_type`` fixes the geometry and unit. The pair is unique within
    a product so each product carries its own catalogue of things to measure.
    """

    id: int
    product_id: str
    name: str
    measurement_type: MeasurementType
    created_at: datetime


@dataclass(frozen=True, slots=True)
class Measurement:
    id: int
    image_id: int
    # The product measurement item this instance realises, when the operator
    # picked one. Null keeps ad-hoc measurements possible.
    item_id: int | None
    measurement_type: MeasurementType
    # Original-pixel points: 2 for length, 3 for angle (vertex first) and
    # curvature. Ordered as placed so the geometry can be redrawn and revalued.
    points: tuple[Point, ...]
    # The computed result in ``unit`` (nm for length/curvature, deg for angle).
    value: float
    unit: str
    calibration_nm_per_pixel: float
    # Annotation: ``label`` names what was measured (drawn beside the shape) and
    # ``note`` is a free observation memo. Neither affects ``value``.
    label: str | None
    note: str | None
    created_at: datetime
    measurement_method: str = "manual"
    reference_status: ReferenceStatus = ReferenceStatus.UNREVIEWED


@dataclass(frozen=True, slots=True)
class CatalogOption:
    """A single selectable value in one managed lookup list.

    ``is_predefined`` marks seeded values (e.g. TEM/SEM, W01-W25) that are part
    of the shipped defaults and are protected from deletion; values added by
    operators are removable.
    """

    id: int
    category: CatalogCategory
    value: str
    is_predefined: bool
    created_at: datetime


@dataclass(frozen=True, slots=True)
class ExpectedSummaryEntry:
    measurement_type: MeasurementType
    unit: str
    count: int
    mean: float


@dataclass(frozen=True, slots=True)
class MeasurementTypeStat:
    """Per-type statistics for the summary API (home KPI breakdown).

    Values within one measurement type share a unit, so mean/min/max are
    comparable; they are not comparable across types (nm vs deg).
    """

    measurement_type: MeasurementType
    unit: str
    count: int
    mean: float
    min: float
    max: float


@dataclass(frozen=True, slots=True)
class ExportSnapshot:
    schema_version: str
    exported_at: datetime
    image: Image
    measurements: tuple[Measurement, ...]
    expected_summary: tuple[ExpectedSummaryEntry, ...]

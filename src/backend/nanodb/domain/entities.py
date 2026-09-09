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


class MeasurementSource(StrEnum):
    """Who produced a measurement.

    ``MANUAL`` is a human-drawn measurement; ``AUTO`` is derived by the feature
    extractor from a segmentation label map. Auto values are never presented as
    a verified reference: the two are kept distinct in storage and on screen.
    """

    MANUAL = "manual"
    AUTO = "auto"


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
    # Provenance: manual (human-drawn) or auto (feature extractor). ``confidence``
    # is a 0..1 self-estimate populated only for auto measurements.
    source: MeasurementSource = MeasurementSource.MANUAL
    confidence: float | None = None
    reference_status: ReferenceStatus = ReferenceStatus.UNREVIEWED
    # Correction trail. Auto extraction is not exact and a hand-placed point can
    # miss, so the points of a saved measurement can be moved -- but never
    # silently: the first correction keeps the geometry and value as they were
    # first produced, and ``adjusted_at`` records that a person moved them.
    # ``None`` throughout means the measurement still reads as first produced.
    original_points: tuple[Point, ...] | None = None
    original_value: float | None = None
    adjusted_at: datetime | None = None

    @property
    def is_adjusted(self) -> bool:
        """True once a person has corrected the points of this measurement."""
        return self.adjusted_at is not None

    @property
    def measurement_method(self) -> str:
        """Backwards-compatible alias for ``source`` used by the transport view."""
        return self.source.value


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
class SegmentationClassStat:
    """Per-class statistics of a multi-Otsu segmentation.

    ``intensity_range`` is the normalized [0, 1] brightness band the class
    covers. ``area_nm2`` is ``pixels * calibration**2`` and is ``None`` when the
    image has no calibration. ``mean_intensity`` is ``None`` for an empty class.
    """

    class_index: int
    intensity_range: tuple[float, float]
    pixels: int
    area_fraction: float
    mean_intensity: float | None
    area_nm2: float | None


@dataclass(frozen=True, slots=True)
class SegmentationResult:
    """A stored multi-Otsu segmentation of one image and its derived artifacts.

    Paths are stored keys under the derived-file root, not absolute paths, so a
    relocated data directory keeps working. ``downscaled`` records whether the
    image was processed at reduced resolution to meet the time budget; the
    stored label map is always at original resolution.
    """

    id: int
    image_id: int
    method: str
    classes: int
    denoise_weight: float
    min_size: int
    thresholds: tuple[float, ...]
    class_stats: tuple[SegmentationClassStat, ...]
    map_path: str
    boundary_path: str
    labels_path: str
    tagged_path: str | None
    duration_ms: int
    downscaled: bool
    created_at: datetime


@dataclass(frozen=True, slots=True)
class ExportSnapshot:
    schema_version: str
    exported_at: datetime
    image: Image
    measurements: tuple[Measurement, ...]
    expected_summary: tuple[ExpectedSummaryEntry, ...]

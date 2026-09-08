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


class ParameterType(StrEnum):
    CD = "CD"
    DEPTH = "Depth"
    THICKNESS = "Thickness"


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
class Measurement:
    id: int
    image_id: int
    parameter_type: ParameterType
    start: Point
    end: Point
    distance_px: float
    calibration_nm_per_pixel: float
    value_nm: float
    # Annotation of the measurement: ``label`` names what was measured
    # (e.g. "Gate CD") and is drawn beside the line; ``note`` is a free
    # observation memo. Both are optional and neither affects value_nm.
    label: str | None
    note: str | None
    created_at: datetime
    measurement_method: str = "manual_two_point"
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
    parameter_type: ParameterType
    count: int
    mean_nm: float


@dataclass(frozen=True, slots=True)
class ParameterStat:
    """Per-parameter statistics for the summary API (home KPI breakdown).

    Kept separate from ExpectedSummaryEntry, which is part of the frozen
    context-export snapshot contract and must not grow new fields.
    """

    parameter_type: ParameterType
    count: int
    mean_nm: float
    min_nm: float
    max_nm: float


@dataclass(frozen=True, slots=True)
class ExportSnapshot:
    schema_version: str
    exported_at: datetime
    image: Image
    measurements: tuple[Measurement, ...]
    expected_summary: tuple[ExpectedSummaryEntry, ...]

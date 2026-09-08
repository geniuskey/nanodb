"""Explicit public transport contracts for the internal NANoDB API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat

from nanodb.domain.entities import (
    CatalogCategory,
    MeasurementType,
    ReferenceStatus,
)


class ErrorDetail(BaseModel):
    field: str | None = None


class ErrorEnvelope(BaseModel):
    code: str
    message: str
    detail: ErrorDetail | None = None


class PointInput(BaseModel):
    x: FiniteFloat
    y: FiniteFloat


class MeasurementInputSchema(BaseModel):
    """A drawn measurement submitted for server-side evaluation.

    ``measurement_type`` fixes the geometry and the point count: 2 points for
    length, 3 for angle (vertex first) and curvature. ``item_id`` links the
    instance to a per-product measurement item when the operator picked one.
    """

    measurement_type: MeasurementType
    points: list[PointInput] = Field(min_length=2, max_length=3)
    item_id: int | None = None
    label: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=4000)


class MeasurementAnnotationSchema(BaseModel):
    """The annotation of a measurement: what it is, and what was observed.

    Only these two fields are editable; the measurement's evidence is
    immutable. Both are replaced together, so a request always states the
    full annotation rather than patching one half of it.
    """

    label: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=4000)


class PointView(BaseModel):
    x: float
    y: float


class MeasurementView(BaseModel):
    id: int
    image_id: int
    item_id: int | None
    measurement_type: MeasurementType
    points: list[PointView]
    value: float
    unit: str
    calibration_nm_per_pixel: float
    label: str | None
    note: str | None
    measurement_method: str
    reference_status: ReferenceStatus
    created_at: datetime


class MeasurementItemView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: str
    name: str
    measurement_type: MeasurementType
    created_at: datetime


class MeasurementItemCreateSchema(BaseModel):
    product_id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    measurement_type: MeasurementType


class MeasurementItemUpdateSchema(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    measurement_type: MeasurementType


class ImageView(BaseModel):
    id: int
    original_filename: str
    image_type: str
    product_id: str
    lot_id: str
    wafer_id: str
    process_step: str | None
    calibration_nm_per_pixel: float
    pixel_width: int
    pixel_height: int
    created_at: datetime
    file_url: str


class ImageListView(ImageView):
    measurement_count: int


class ImageDetailView(ImageView):
    measurements: list[MeasurementView]


class MeasurementTypeSummaryView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    measurement_type: MeasurementType
    unit: str
    count: int
    mean: float
    min: float
    max: float


class SummaryView(BaseModel):
    image_count: int
    measurement_count: int
    calculated_at: datetime
    types: list[MeasurementTypeSummaryView] = Field(default_factory=list)


class ReadinessView(BaseModel):
    status: str
    database: str
    upload_root: str


class SegmentationRequestSchema(BaseModel):
    """Optional overrides for a segmentation run; each field keeps its default."""

    classes: int = Field(default=4, ge=2, le=6)
    denoise_weight: float = Field(default=0.08, gt=0)
    min_size: int = Field(default=400, ge=0)


class SegmentationClassStatView(BaseModel):
    class_index: int
    intensity_range: list[float]
    pixels: int
    area_fraction: float
    mean_intensity: float | None
    area_nm2: float | None


class SegmentationResultView(BaseModel):
    image_id: int
    method: str
    classes: int
    denoise_weight: float
    min_size: int
    thresholds: list[float]
    class_stats: list[SegmentationClassStatView]
    duration_ms: int
    downscaled: bool
    has_tagged_tiff: bool
    map_url: str
    boundary_url: str
    created_at: datetime
    # True when this run replaced a prior segmentation of the same image. Always
    # false on a plain GET.
    replaced: bool = False


class CatalogOptionView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: CatalogCategory
    value: str
    is_predefined: bool


class CatalogCreateSchema(BaseModel):
    category: CatalogCategory
    value: str = Field(min_length=1, max_length=255)


class CatalogUpdateSchema(BaseModel):
    value: str = Field(min_length=1, max_length=255)

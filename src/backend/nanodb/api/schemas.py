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


class MeasurementGeometrySchema(BaseModel):
    """New positions for a saved measurement's points.

    Only the points are writable: the measurement type and the calibration stay
    as recorded, and the value is recomputed on the server from these points
    rather than accepted from the caller. The point count must match the stored
    type (2 for length, 3 for angle and curvature).
    """

    points: list[PointInput] = Field(min_length=2, max_length=3)


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
    # Provenance the UI uses to keep machine output distinct from human work:
    # ``source`` is "manual" or "auto"; ``confidence`` is a 0..1 self-estimate
    # populated only for auto measurements (null for manual).
    source: str
    confidence: float | None
    reference_status: ReferenceStatus
    # Correction trail. ``points``/``value`` always read as the measurement
    # stands now; when ``adjusted_at`` is set a person has moved the points and
    # ``original_points``/``original_value`` hold what it read when first
    # produced, so the machine's answer stays comparable. All three are null
    # while the measurement is uncorrected.
    original_points: list[PointView] | None
    original_value: float | None
    adjusted_at: datetime | None
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


class FeatureExtractionRequestSchema(BaseModel):
    """Optional overrides for a feature-extraction run; each keeps its default.

    ``target_class`` selects which segmentation class to measure (0 = darkest).
    ``sidewall_band`` is the vertical fraction of the region used to fit each
    sidewall, given as ``[low, high]`` with ``0 <= low < high <= 1``.
    """

    target_class: int = Field(default=0, ge=0, le=5)
    min_area: int = Field(default=200, ge=0)
    curvature_frac: float = Field(default=0.6, gt=0, le=1)
    sidewall_band: list[FiniteFloat] = Field(
        default_factory=lambda: [0.2, 0.8], min_length=2, max_length=2
    )
    max_radius_factor: FiniteFloat = Field(default=3.0, gt=0)


class SkippedFeatureViewSchema(BaseModel):
    key: str
    reason: str


class FeatureExtractionResultView(BaseModel):
    """The outcome of one feature-extraction run.

    ``measurements`` are the auto measurements persisted this run (each also
    appears in the image detail). ``skipped`` lists features that were not
    emitted, with an honest reason, so degenerate geometry is visible rather
    than silently dropped.
    """

    image_id: int
    target_class: int
    region_area_px: int
    region_clipped: bool
    measurements: list[MeasurementView]
    skipped: list[SkippedFeatureViewSchema]
    # Auto measurements a person had corrected, left standing by this run
    # instead of being replaced. Their corrections are human work.
    preserved_adjusted: int = 0


class SegmentationBatchRequestSchema(BaseModel):
    """Run segmentation (and optionally feature extraction) over many images.

    Segmentation parameters mirror :class:`SegmentationRequestSchema`. When
    ``extract_features`` is set, feature extraction runs on each image after its
    segmentation, using ``target_class``.
    """

    image_ids: list[int] = Field(min_length=1, max_length=200)
    classes: int = Field(default=4, ge=2, le=6)
    denoise_weight: float = Field(default=0.08, gt=0)
    min_size: int = Field(default=400, ge=0)
    extract_features: bool = False
    target_class: int = Field(default=0, ge=0, le=5)


class BatchItemResultView(BaseModel):
    image_id: int
    status: str
    replaced: bool
    feature_count: int | None
    skipped_count: int | None
    code: str | None
    message: str | None


class SegmentationBatchResultView(BaseModel):
    requested: int
    succeeded: int
    failed: int
    items: list[BatchItemResultView]


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

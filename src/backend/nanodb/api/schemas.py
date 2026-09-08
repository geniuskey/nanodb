"""Explicit public transport contracts for the internal NANoDB API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat

from nanodb.domain.entities import ImageType, ParameterType, ReferenceStatus


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
    parameter_type: ParameterType
    start: PointInput
    end: PointInput
    note: str | None = Field(default=None, max_length=4000)


class MeasurementView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_id: int
    parameter_type: ParameterType
    start_x: float
    start_y: float
    end_x: float
    end_y: float
    distance_px: float
    calibration_nm_per_pixel: float
    value_nm: float
    note: str | None
    measurement_method: str
    reference_status: ReferenceStatus
    created_at: datetime


class ImageView(BaseModel):
    id: int
    original_filename: str
    image_type: ImageType
    product_id: str
    lot_id: str
    wafer_id: str
    calibration_nm_per_pixel: float
    pixel_width: int
    pixel_height: int
    created_at: datetime
    file_url: str


class ImageListView(ImageView):
    measurement_count: int


class ImageDetailView(ImageView):
    measurements: list[MeasurementView]


class ParameterSummaryView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    parameter_type: ParameterType
    count: int
    mean_nm: float


class SummaryView(BaseModel):
    image_count: int
    measurement_count: int
    calculated_at: datetime
    parameters: list[ParameterSummaryView] = Field(default_factory=list)


class ReadinessView(BaseModel):
    status: str
    database: str
    upload_root: str

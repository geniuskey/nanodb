"""Repository adapters with deterministic NANoDB query contracts."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from nanodb.domain.calculations import MeasurementCalculation
from nanodb.domain.entities import (
    Image,
    ImageType,
    Measurement,
    ParameterType,
    Point,
)
from nanodb.persistence.models import ImageModel, MeasurementModel


@dataclass(frozen=True, slots=True)
class ImageListItem:
    image: Image
    measurement_count: int


def _to_image(model: ImageModel) -> Image:
    return Image(
        id=model.id,
        original_filename=model.original_filename,
        stored_filename=model.stored_filename,
        image_type=ImageType(model.image_type),
        product_id=model.product_id,
        lot_id=model.lot_id,
        wafer_id=model.wafer_id,
        calibration_nm_per_pixel=model.calibration_nm_per_pixel,
        pixel_width=model.pixel_width,
        pixel_height=model.pixel_height,
        created_at=model.created_at,
    )


def _to_measurement(model: MeasurementModel) -> Measurement:
    return Measurement(
        id=model.id,
        image_id=model.image_id,
        parameter_type=ParameterType(model.parameter_type),
        start=Point(model.start_x, model.start_y),
        end=Point(model.end_x, model.end_y),
        distance_px=model.distance_px,
        calibration_nm_per_pixel=model.calibration_nm_per_pixel,
        value_nm=model.value_nm,
        note=model.note,
        created_at=model.created_at,
    )


class ImageRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        *,
        original_filename: str,
        stored_filename: str,
        image_type: ImageType,
        product_id: str,
        lot_id: str,
        wafer_id: str,
        calibration_nm_per_pixel: float,
        pixel_width: int,
        pixel_height: int,
    ) -> Image:
        model = ImageModel(
            original_filename=original_filename,
            stored_filename=stored_filename,
            image_type=image_type.value,
            product_id=product_id,
            lot_id=lot_id,
            wafer_id=wafer_id,
            calibration_nm_per_pixel=calibration_nm_per_pixel,
            pixel_width=pixel_width,
            pixel_height=pixel_height,
        )
        self._session.add(model)
        self._session.flush()
        self._session.refresh(model)
        return _to_image(model)

    def find(self, image_id: int) -> Image | None:
        model = self._session.get(ImageModel, image_id)
        return _to_image(model) if model else None

    def count(self) -> int:
        return self._session.scalar(select(func.count(ImageModel.id))) or 0

    def list_with_measurement_count(self) -> tuple[ImageListItem, ...]:
        statement: Select[tuple[ImageModel, int]] = (
            select(ImageModel, func.count(MeasurementModel.id))
            .outerjoin(MeasurementModel, MeasurementModel.image_id == ImageModel.id)
            .group_by(ImageModel.id)
            .order_by(ImageModel.created_at.desc(), ImageModel.id.desc())
        )
        return tuple(
            ImageListItem(_to_image(model), int(count))
            for model, count in self._session.execute(statement).all()
        )


class MeasurementRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        *,
        image_id: int,
        parameter_type: ParameterType,
        start: Point,
        end: Point,
        calculation: MeasurementCalculation,
        calibration_nm_per_pixel: float,
        note: str | None,
    ) -> Measurement:
        model = MeasurementModel(
            image_id=image_id,
            parameter_type=parameter_type.value,
            start_x=start.x,
            start_y=start.y,
            end_x=end.x,
            end_y=end.y,
            distance_px=calculation.distance_px,
            calibration_nm_per_pixel=calibration_nm_per_pixel,
            value_nm=calculation.value_nm,
            note=note,
        )
        self._session.add(model)
        self._session.flush()
        self._session.refresh(model)
        return _to_measurement(model)

    def count(self) -> int:
        return self._session.scalar(select(func.count(MeasurementModel.id))) or 0

    def list_by_image(
        self,
        image_id: int,
        *,
        export_order: bool = False,
    ) -> tuple[Measurement, ...]:
        statement = select(MeasurementModel).where(
            MeasurementModel.image_id == image_id
        )
        if export_order:
            statement = statement.order_by(MeasurementModel.id.asc())
        else:
            statement = statement.order_by(
                MeasurementModel.created_at.desc(),
                MeasurementModel.id.desc(),
            )
        return tuple(
            _to_measurement(model) for model in self._session.scalars(statement)
        )

    def delete_all(self) -> None:
        for model in self._session.scalars(select(MeasurementModel)):
            self._session.delete(model)


def database_clock(session: Session) -> datetime:
    """Return the PostgreSQL transaction timestamp for summary responses."""
    value = session.scalar(select(func.now()))
    if value is None:
        raise RuntimeError("Database did not return a transaction timestamp.")
    return value

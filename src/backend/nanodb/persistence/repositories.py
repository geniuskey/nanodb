"""Repository adapters with deterministic NANoDB query contracts."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from nanodb.domain.calculations import MeasurementCalculation
from nanodb.domain.entities import (
    Image,
    ImageType,
    Measurement,
    ParameterStat,
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
        display_filename=model.display_filename,
        image_type=ImageType(model.image_type),
        product_id=model.product_id,
        lot_id=model.lot_id,
        wafer_id=model.wafer_id,
        process_step=model.process_step,
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
        label=model.label,
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
        display_filename: str | None = None,
        process_step: str | None = None,
    ) -> Image:
        model = ImageModel(
            original_filename=original_filename,
            stored_filename=stored_filename,
            display_filename=display_filename,
            image_type=image_type.value,
            product_id=product_id,
            lot_id=lot_id,
            wafer_id=wafer_id,
            process_step=process_step,
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

    def delete(self, image_id: int) -> bool:
        """Delete an image row. Callers must remove its measurements first
        because the foreign key uses RESTRICT."""
        model = self._session.get(ImageModel, image_id)
        if model is None:
            return False
        self._session.delete(model)
        return True

    def list_with_measurement_count(
        self,
        *,
        query: str | None = None,
        image_type: ImageType | None = None,
    ) -> tuple[ImageListItem, ...]:
        """List images newest-first, optionally filtered.

        ``query`` is a case-insensitive partial match against original filename,
        product, lot, wafer and process step. ``image_type`` narrows to SEM or
        TEM. A blank query matches everything so the catalog stays visible
        while typing.
        """
        statement: Select[tuple[ImageModel, int]] = (
            select(ImageModel, func.count(MeasurementModel.id))
            .outerjoin(MeasurementModel, MeasurementModel.image_id == ImageModel.id)
            .group_by(ImageModel.id)
            .order_by(ImageModel.created_at.desc(), ImageModel.id.desc())
        )
        if image_type is not None:
            statement = statement.where(ImageModel.image_type == image_type.value)
        if query and query.strip():
            pattern = f"%{query.strip()}%"
            statement = statement.where(
                or_(
                    ImageModel.original_filename.ilike(pattern),
                    ImageModel.product_id.ilike(pattern),
                    ImageModel.lot_id.ilike(pattern),
                    ImageModel.wafer_id.ilike(pattern),
                    ImageModel.process_step.ilike(pattern),
                )
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
        label: str | None,
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
            label=label,
            note=note,
        )
        self._session.add(model)
        self._session.flush()
        self._session.refresh(model)
        return _to_measurement(model)

    def count(self) -> int:
        return self._session.scalar(select(func.count(MeasurementModel.id))) or 0

    def aggregate_by_parameter(self) -> tuple[ParameterStat, ...]:
        """Per-parameter count, mean, min and max in the fixed CD, Depth,
        Thickness order.

        Only parameters with at least one stored measurement are returned, so an
        empty database and never-measured parameters both stay absent (n=0).
        """
        statement = select(
            MeasurementModel.parameter_type,
            func.count(MeasurementModel.id),
            func.sum(MeasurementModel.value_nm),
            func.min(MeasurementModel.value_nm),
            func.max(MeasurementModel.value_nm),
        ).group_by(MeasurementModel.parameter_type)
        rows = {
            parameter_type: (int(count), float(total), float(low), float(high))
            for parameter_type, count, total, low, high in self._session.execute(
                statement
            )
        }
        return tuple(
            ParameterStat(
                parameter_type=parameter_type,
                count=rows[parameter_type.value][0],
                mean_nm=rows[parameter_type.value][1] / rows[parameter_type.value][0],
                min_nm=rows[parameter_type.value][2],
                max_nm=rows[parameter_type.value][3],
            )
            for parameter_type in ParameterType
            if rows.get(parameter_type.value, (0, 0.0, 0.0, 0.0))[0] > 0
        )

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

    def update_annotation(
        self,
        image_id: int,
        measurement_id: int,
        *,
        label: str | None,
        note: str | None,
    ) -> Measurement | None:
        """Replace a measurement's annotation (its label and note).

        The evidence a measurement rests on -- its coordinates, parameter,
        distance, calibration and value -- is immutable, so only the two
        descriptive fields are writable. Both are replaced together because
        the editor always submits both. Returns ``None`` when the measurement
        is missing or belongs to a different image, so callers cannot edit
        across images by guessing ids.
        """
        model = self._session.get(MeasurementModel, measurement_id)
        if model is None or model.image_id != image_id:
            return None
        model.label = label
        model.note = note
        self._session.flush()
        self._session.refresh(model)
        return _to_measurement(model)

    def delete(self, image_id: int, measurement_id: int) -> bool:
        """Delete a single measurement scoped to its image.

        Returns ``True`` when a matching measurement was removed. A measurement
        that belongs to a different image is treated as not found so callers
        cannot delete across images by guessing ids.
        """
        model = self._session.get(MeasurementModel, measurement_id)
        if model is None or model.image_id != image_id:
            return False
        self._session.delete(model)
        return True

    def delete_by_image(self, image_id: int) -> int:
        """Delete every measurement for an image; returns how many were removed."""
        count = 0
        statement = select(MeasurementModel).where(
            MeasurementModel.image_id == image_id
        )
        for model in self._session.scalars(statement):
            self._session.delete(model)
            count += 1
        return count

    def delete_all(self) -> None:
        for model in self._session.scalars(select(MeasurementModel)):
            self._session.delete(model)


def database_clock(session: Session) -> datetime:
    """Return the PostgreSQL transaction timestamp for summary responses."""
    value = session.scalar(select(func.now()))
    if value is None:
        raise RuntimeError("Database did not return a transaction timestamp.")
    return value

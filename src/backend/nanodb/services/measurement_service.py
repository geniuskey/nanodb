"""Server-authoritative measurement creation and retrieval."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session, sessionmaker

from nanodb.domain.calculations import calculate_measurement
from nanodb.domain.entities import Measurement, MeasurementType, Point
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import (
    ImageRepository,
    MeasurementItemRepository,
    MeasurementRepository,
)


@dataclass(frozen=True, slots=True)
class MeasurementInput:
    """A drawn measurement submitted for server-side evaluation.

    ``measurement_type`` fixes the geometry and the expected ``points`` count
    (2 for length, 3 for angle/curvature). ``item_id`` links the instance to a
    product measurement item when the operator picked one; when set, its type
    must match ``measurement_type`` so the drawing tool and the definition agree.
    """

    measurement_type: MeasurementType
    points: tuple[Point, ...]
    item_id: int | None = None
    label: str | None = None
    note: str | None = None


class MeasurementService:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def create(self, image_id: int, value: MeasurementInput) -> Measurement:
        with self._session_factory() as session:
            image = ImageRepository(session).find(image_id)
            if image is None:
                raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
            if value.item_id is not None:
                item = MeasurementItemRepository(session).find(value.item_id)
                if item is None:
                    raise DomainError(
                        "MEASUREMENT_ITEM_NOT_FOUND",
                        "Measurement item was not found.",
                        field="item_id",
                    )
                if item.product_id != image.product_id:
                    raise DomainError(
                        "MEASUREMENT_ITEM_PRODUCT_MISMATCH",
                        "Measurement item belongs to a different product.",
                        field="item_id",
                    )
                if item.measurement_type is not value.measurement_type:
                    raise DomainError(
                        "MEASUREMENT_TYPE_MISMATCH",
                        "Measurement type does not match the selected item.",
                        field="measurement_type",
                    )
            result = calculate_measurement(
                value.measurement_type,
                value.points,
                image.calibration_nm_per_pixel,
                pixel_width=image.pixel_width,
                pixel_height=image.pixel_height,
            )
            measurement = MeasurementRepository(session).create(
                image_id=image.id,
                item_id=value.item_id,
                measurement_type=value.measurement_type,
                points=value.points,
                result=result,
                calibration_nm_per_pixel=image.calibration_nm_per_pixel,
                label=value.label,
                note=value.note,
            )
            session.commit()
            return measurement

    def list_for_image(self, image_id: int) -> tuple[Measurement, ...]:
        with self._session_factory() as session:
            if ImageRepository(session).find(image_id) is None:
                raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
            return MeasurementRepository(session).list_by_image(image_id)

    def update_annotation(
        self,
        image_id: int,
        measurement_id: int,
        *,
        label: str | None,
        note: str | None,
    ) -> Measurement:
        """Edit what a saved measurement is (label) and the observation memo
        (note), leaving its evidence untouched."""
        with self._session_factory() as session:
            if ImageRepository(session).find(image_id) is None:
                raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
            measurement = MeasurementRepository(session).update_annotation(
                image_id,
                measurement_id,
                label=label,
                note=note,
            )
            if measurement is None:
                raise DomainError("MEASUREMENT_NOT_FOUND", "Measurement was not found.")
            session.commit()
            return measurement

    def delete(self, image_id: int, measurement_id: int) -> None:
        """Remove one derived measurement; the original image is untouched."""
        with self._session_factory() as session:
            if ImageRepository(session).find(image_id) is None:
                raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
            if not MeasurementRepository(session).delete(image_id, measurement_id):
                raise DomainError("MEASUREMENT_NOT_FOUND", "Measurement was not found.")
            session.commit()

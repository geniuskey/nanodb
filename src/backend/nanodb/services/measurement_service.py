"""Server-authoritative measurement creation and retrieval."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session, sessionmaker

from nanodb.domain.calculations import calculate_measurement
from nanodb.domain.entities import Measurement, ParameterType, Point
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import ImageRepository, MeasurementRepository


@dataclass(frozen=True, slots=True)
class MeasurementInput:
    parameter_type: ParameterType
    start: Point
    end: Point
    note: str | None = None


class MeasurementService:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def create(self, image_id: int, value: MeasurementInput) -> Measurement:
        with self._session_factory() as session:
            image = ImageRepository(session).find(image_id)
            if image is None:
                raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
            calculation = calculate_measurement(
                value.start,
                value.end,
                image.calibration_nm_per_pixel,
                pixel_width=image.pixel_width,
                pixel_height=image.pixel_height,
            )
            measurement = MeasurementRepository(session).create(
                image_id=image.id,
                parameter_type=value.parameter_type,
                start=value.start,
                end=value.end,
                calculation=calculation,
                calibration_nm_per_pixel=image.calibration_nm_per_pixel,
                note=value.note,
            )
            session.commit()
            return measurement

    def list_for_image(self, image_id: int) -> tuple[Measurement, ...]:
        with self._session_factory() as session:
            if ImageRepository(session).find(image_id) is None:
                raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
            return MeasurementRepository(session).list_by_image(image_id)

"""Image registration and retrieval orchestration."""

from __future__ import annotations

import math
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from sqlalchemy.orm import Session, sessionmaker

from nanodb.adapters.file_store import FileStore
from nanodb.adapters.image_decoder import ImageDecoder
from nanodb.domain.entities import Image, ImageType
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import (
    AnnotationRepository,
    ImageListItem,
    ImageRepository,
    MeasurementRepository,
)


@dataclass(frozen=True, slots=True)
class ImageRegistration:
    original_filename: str
    image_type: ImageType
    product_id: str
    lot_id: str
    wafer_id: str
    calibration_nm_per_pixel: float


class ImageService:
    def __init__(
        self,
        session_factory: sessionmaker[Session],
        file_store: FileStore,
        decoder: ImageDecoder,
    ) -> None:
        self._session_factory = session_factory
        self._file_store = file_store
        self._decoder = decoder

    @staticmethod
    def _validate_registration(registration: ImageRegistration) -> None:
        fields = {
            "original_filename": registration.original_filename,
            "product_id": registration.product_id,
            "lot_id": registration.lot_id,
            "wafer_id": registration.wafer_id,
        }
        for field, value in fields.items():
            if not value.strip():
                raise DomainError(
                    "REQUIRED_FIELD",
                    f"{field} is required.",
                    field=field,
                )
        calibration = registration.calibration_nm_per_pixel
        if not math.isfinite(calibration) or calibration <= 0:
            raise DomainError(
                "INVALID_CALIBRATION",
                "Calibration must be a finite number greater than zero.",
                field="calibration_nm_per_pixel",
            )

    def register(self, stream: BinaryIO, registration: ImageRegistration) -> Image:
        self._validate_registration(registration)
        temporary_key = self._file_store.write_temporary(stream)
        display_temporary_key: str | None = None
        final_key: str | None = None
        display_key: str | None = None
        session = self._session_factory()
        try:
            source_path = self._file_store.temporary_path(temporary_key)
            decoded = self._decoder.inspect(source_path)
            final_key = f"{uuid4().hex}{decoded.extension}"
            # Preserve the original untouched; generate a browser-renderable
            # PNG derivative for formats an <img> cannot display (e.g. TIFF).
            if not decoded.browser_renderable:
                preview = self._decoder.render_web_preview(source_path)
                display_temporary_key = self._file_store.write_temporary(
                    BytesIO(preview)
                )
                display_key = f"{uuid4().hex}.png"
            image = ImageRepository(session).create(
                original_filename=registration.original_filename,
                stored_filename=final_key,
                display_filename=display_key,
                image_type=registration.image_type,
                product_id=registration.product_id.strip(),
                lot_id=registration.lot_id.strip(),
                wafer_id=registration.wafer_id.strip(),
                calibration_nm_per_pixel=registration.calibration_nm_per_pixel,
                pixel_width=decoded.pixel_width,
                pixel_height=decoded.pixel_height,
            )
            self._file_store.promote(temporary_key, final_key)
            if display_temporary_key is not None and display_key is not None:
                self._file_store.promote(display_temporary_key, display_key)
            session.commit()
            return image
        except BaseException:
            session.rollback()
            self._file_store.delete_if_exists(temporary_key, temporary=True)
            if display_temporary_key is not None:
                self._file_store.delete_if_exists(display_temporary_key, temporary=True)
            if final_key is not None:
                self._file_store.delete_if_exists(final_key)
            if display_key is not None:
                self._file_store.delete_if_exists(display_key)
            raise
        finally:
            session.close()

    def list_images(
        self,
        *,
        query: str | None = None,
        image_type: ImageType | None = None,
    ) -> tuple[ImageListItem, ...]:
        with self._session_factory() as session:
            return ImageRepository(session).list_with_measurement_count(
                query=query,
                image_type=image_type,
            )

    def get_image(self, image_id: int) -> Image:
        with self._session_factory() as session:
            image = ImageRepository(session).find(image_id)
        if image is None:
            raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
        return image

    def delete(self, image_id: int) -> None:
        """Delete an image with its measurements and annotations, then its file.

        Child rows are removed first because the foreign keys use RESTRICT.
        The file is deleted only after the rows are committed, so a failure
        leaves an orphan file (recoverable) rather than a row pointing at a
        missing file.
        """
        with self._session_factory() as session:
            repository = ImageRepository(session)
            image = repository.find(image_id)
            if image is None:
                raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
            MeasurementRepository(session).delete_by_image(image_id)
            AnnotationRepository(session).delete_by_image(image_id)
            repository.delete(image_id)
            session.commit()
        self._file_store.delete_if_exists(image.stored_filename)
        if image.display_filename is not None:
            self._file_store.delete_if_exists(image.display_filename)

    def image_path(self, image_id: int) -> Path:
        """Path to serve for the image: the browser-renderable display
        derivative when one exists (e.g. for TIFF), else the original."""
        image = self.get_image(image_id)
        return self._file_store.path_for_response(
            image.display_filename or image.stored_filename
        )

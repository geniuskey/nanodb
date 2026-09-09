"""Single-image snapshot orchestration for context exports."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session, sessionmaker

from nanodb.domain.calculations import (
    build_expected_summary,
    validate_export_snapshot,
)
from nanodb.domain.entities import ExportSnapshot
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import ImageRepository, MeasurementRepository
from nanodb.services.export_builder import build_context_zip


class ContextExportService:
    schema_version = "3.1"

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def build(self, image_id: int) -> bytes:
        with self._session_factory() as session:
            image = ImageRepository(session).find(image_id)
            if image is None:
                raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
            measurements = MeasurementRepository(session).list_by_image(
                image_id,
                export_order=True,
            )
            snapshot = ExportSnapshot(
                schema_version=self.schema_version,
                exported_at=datetime.now(UTC),
                image=image,
                measurements=measurements,
                expected_summary=build_expected_summary(measurements),
            )
            validate_export_snapshot(snapshot)
            return build_context_zip(snapshot)

"""Actual PostgreSQL count summary service."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.orm import Session, sessionmaker

from nanodb.domain.entities import ExpectedSummaryEntry
from nanodb.persistence.repositories import (
    ImageRepository,
    MeasurementRepository,
    database_clock,
)


@dataclass(frozen=True, slots=True)
class Summary:
    image_count: int
    measurement_count: int
    calculated_at: datetime
    parameters: tuple[ExpectedSummaryEntry, ...] = field(default_factory=tuple)


class SummaryService:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def get(self) -> Summary:
        with self._session_factory() as session:
            measurements = MeasurementRepository(session)
            return Summary(
                image_count=ImageRepository(session).count(),
                measurement_count=measurements.count(),
                calculated_at=database_clock(session),
                parameters=measurements.aggregate_by_parameter(),
            )

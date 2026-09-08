"""Actual PostgreSQL count summary service."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session, sessionmaker

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


class SummaryService:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def get(self) -> Summary:
        with self._session_factory() as session:
            return Summary(
                image_count=ImageRepository(session).count(),
                measurement_count=MeasurementRepository(session).count(),
                calculated_at=database_clock(session),
            )

"""Persistence of image annotations (arrow/circle shapes with labels)."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session, sessionmaker

from nanodb.domain.entities import Annotation, Point, ProductType, ShapeKind
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import (
    AnnotationRepository,
    ImageRepository,
)


@dataclass(frozen=True, slots=True)
class AnnotationInput:
    kind: ShapeKind
    start: Point
    end: Point
    product: ProductType | None = None
    step: str = ""
    measurement_name: str = ""


@dataclass(frozen=True, slots=True)
class AnnotationUpdate:
    product: ProductType | None
    step: str
    measurement_name: str


class AnnotationService:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def create(self, image_id: int, value: AnnotationInput) -> Annotation:
        if value.start.x == value.end.x and value.start.y == value.end.y:
            raise DomainError(
                "INVALID_ANNOTATION",
                "A zero-size shape cannot be stored.",
            )
        with self._session_factory() as session:
            if ImageRepository(session).find(image_id) is None:
                raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
            annotation = AnnotationRepository(session).create(
                image_id=image_id,
                kind=value.kind,
                start=value.start,
                end=value.end,
                product=value.product,
                step=value.step,
                measurement_name=value.measurement_name,
            )
            session.commit()
            return annotation

    def update(
        self,
        image_id: int,
        annotation_id: int,
        value: AnnotationUpdate,
    ) -> Annotation:
        with self._session_factory() as session:
            if ImageRepository(session).find(image_id) is None:
                raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
            annotation = AnnotationRepository(session).update_fields(
                image_id,
                annotation_id,
                product=value.product,
                step=value.step,
                measurement_name=value.measurement_name,
            )
            if annotation is None:
                raise DomainError(
                    "ANNOTATION_NOT_FOUND", "Annotation was not found."
                )
            session.commit()
            return annotation

    def list_for_image(self, image_id: int) -> tuple[Annotation, ...]:
        with self._session_factory() as session:
            if ImageRepository(session).find(image_id) is None:
                raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
            return AnnotationRepository(session).list_by_image(image_id)

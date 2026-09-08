"""Per-product measurement item definitions (name + geometry type)."""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from nanodb.domain.entities import MeasurementItem, MeasurementType
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import MeasurementItemRepository

MAX_NAME_LENGTH = 255


class MeasurementItemService:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def list_for_product(self, product_id: str) -> tuple[MeasurementItem, ...]:
        cleaned = product_id.strip()
        if not cleaned:
            raise DomainError(
                "REQUIRED_FIELD",
                "Product id is required.",
                field="product_id",
            )
        with self._session_factory() as session:
            return MeasurementItemRepository(session).list_by_product(cleaned)

    def create(
        self,
        product_id: str,
        name: str,
        measurement_type: MeasurementType,
    ) -> MeasurementItem:
        product = self._clean_product(product_id)
        cleaned = self._clean_name(name)
        with self._session_factory() as session:
            repository = MeasurementItemRepository(session)
            if repository.exists(product, cleaned):
                raise DomainError(
                    "DUPLICATE_MEASUREMENT_ITEM",
                    "This measurement item already exists for the product.",
                    field="name",
                )
            try:
                item = repository.create(
                    product_id=product,
                    name=cleaned,
                    measurement_type=measurement_type,
                )
                session.commit()
            except IntegrityError as error:
                session.rollback()
                raise DomainError(
                    "DUPLICATE_MEASUREMENT_ITEM",
                    "This measurement item already exists for the product.",
                    field="name",
                ) from error
            return item

    def update(
        self,
        item_id: int,
        name: str,
        measurement_type: MeasurementType,
    ) -> MeasurementItem:
        cleaned = self._clean_name(name)
        with self._session_factory() as session:
            repository = MeasurementItemRepository(session)
            existing = repository.find(item_id)
            if existing is None:
                raise DomainError(
                    "MEASUREMENT_ITEM_NOT_FOUND",
                    "Measurement item was not found.",
                )
            if cleaned != existing.name and repository.exists(
                existing.product_id, cleaned
            ):
                raise DomainError(
                    "DUPLICATE_MEASUREMENT_ITEM",
                    "This measurement item already exists for the product.",
                    field="name",
                )
            try:
                item = repository.update(
                    item_id,
                    name=cleaned,
                    measurement_type=measurement_type,
                )
                session.commit()
            except IntegrityError as error:
                session.rollback()
                raise DomainError(
                    "DUPLICATE_MEASUREMENT_ITEM",
                    "This measurement item already exists for the product.",
                    field="name",
                ) from error
            assert item is not None  # found above, same transaction
            return item

    def delete(self, item_id: int) -> None:
        with self._session_factory() as session:
            repository = MeasurementItemRepository(session)
            if not repository.delete(item_id):
                raise DomainError(
                    "MEASUREMENT_ITEM_NOT_FOUND",
                    "Measurement item was not found.",
                )
            session.commit()

    def _clean_product(self, product_id: str) -> str:
        cleaned = product_id.strip()
        if not cleaned:
            raise DomainError(
                "REQUIRED_FIELD",
                "Product id is required.",
                field="product_id",
            )
        return cleaned

    def _clean_name(self, name: str) -> str:
        cleaned = name.strip()
        if not cleaned:
            raise DomainError(
                "REQUIRED_FIELD",
                "Measurement item name is required.",
                field="name",
            )
        if len(cleaned) > MAX_NAME_LENGTH:
            raise DomainError(
                "VALUE_TOO_LONG",
                f"Name must be at most {MAX_NAME_LENGTH} characters.",
                field="name",
            )
        return cleaned

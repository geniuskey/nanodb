"""Managed lookup lists that feed the registration comboboxes."""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from nanodb.domain.entities import CatalogCategory, CatalogOption
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import CatalogRepository

MAX_VALUE_LENGTH = 255


class CatalogService:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def list_all(self) -> tuple[CatalogOption, ...]:
        with self._session_factory() as session:
            return CatalogRepository(session).list_all()

    def create(self, category: CatalogCategory, value: str) -> CatalogOption:
        cleaned = value.strip()
        if not cleaned:
            raise DomainError(
                "REQUIRED_FIELD",
                "Option value is required.",
                field="value",
            )
        if len(cleaned) > MAX_VALUE_LENGTH:
            raise DomainError(
                "VALUE_TOO_LONG",
                f"Option value must be at most {MAX_VALUE_LENGTH} characters.",
                field="value",
            )
        with self._session_factory() as session:
            repository = CatalogRepository(session)
            if repository.exists(category, cleaned):
                raise DomainError(
                    "DUPLICATE_OPTION",
                    "This value already exists in the list.",
                    field="value",
                )
            try:
                option = repository.create(category, cleaned)
                session.commit()
            except IntegrityError as error:
                session.rollback()
                # Lost a race with a concurrent insert of the same value.
                raise DomainError(
                    "DUPLICATE_OPTION",
                    "This value already exists in the list.",
                    field="value",
                ) from error
            return option

    def rename(self, option_id: int, value: str) -> CatalogOption:
        """Change a custom option's value. Predefined options are protected and
        duplicates within the same category are rejected."""
        cleaned = value.strip()
        if not cleaned:
            raise DomainError(
                "REQUIRED_FIELD",
                "Option value is required.",
                field="value",
            )
        if len(cleaned) > MAX_VALUE_LENGTH:
            raise DomainError(
                "VALUE_TOO_LONG",
                f"Option value must be at most {MAX_VALUE_LENGTH} characters.",
                field="value",
            )
        with self._session_factory() as session:
            repository = CatalogRepository(session)
            option = repository.find(option_id)
            if option is None:
                raise DomainError("OPTION_NOT_FOUND", "Option was not found.")
            if option.is_predefined:
                # Seeded defaults are shipped values and keep a stable name.
                raise DomainError(
                    "PREDEFINED_OPTION",
                    "Predefined options cannot be renamed.",
                )
            if cleaned == option.value:
                return option
            if repository.exists(option.category, cleaned):
                raise DomainError(
                    "DUPLICATE_OPTION",
                    "This value already exists in the list.",
                    field="value",
                )
            try:
                renamed = repository.rename(option_id, cleaned)
                session.commit()
            except IntegrityError as error:
                session.rollback()
                raise DomainError(
                    "DUPLICATE_OPTION",
                    "This value already exists in the list.",
                    field="value",
                ) from error
            assert renamed is not None  # found above, same transaction
            return renamed

    def delete(self, option_id: int) -> None:
        with self._session_factory() as session:
            repository = CatalogRepository(session)
            option = repository.find(option_id)
            if option is None:
                raise DomainError("OPTION_NOT_FOUND", "Option was not found.")
            if option.is_predefined:
                # Seeded defaults (e.g. TEM/SEM, W01-W25) are shipped values and
                # stay put so the lists always have a known baseline.
                raise DomainError(
                    "PREDEFINED_OPTION",
                    "Predefined options cannot be deleted.",
                )
            repository.delete(option_id)
            session.commit()

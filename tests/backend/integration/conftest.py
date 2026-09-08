from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from alembic.config import Config
from nanodb.persistence.database import create_session_factory
from sqlalchemy import Engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from alembic import command


@pytest.fixture(scope="session")
def test_database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")
    database_name = make_url(url).database or ""
    if not database_name.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must target a database ending in '_test'")
    return url


@pytest.fixture(scope="session")
def database_engine(
    test_database_url: str,
) -> Iterator[tuple[Engine, sessionmaker[Session]]]:
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", test_database_url.replace("%", "%%"))
    command.upgrade(config, "head")
    engine, factory = create_session_factory(test_database_url)
    yield engine, factory
    engine.dispose()


@pytest.fixture
def db_session(
    database_engine: tuple[Engine, sessionmaker[Session]],
) -> Iterator[Session]:
    engine, factory = database_engine
    with engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE TABLE measurements, measurement_items, images "
                "RESTART IDENTITY CASCADE"
            )
        )
        # Keep the migration-seeded defaults, but drop any custom options a
        # previous test added so catalog assertions start from a known list.
        connection.execute(
            text("DELETE FROM catalog_options WHERE is_predefined = false")
        )
    with factory() as session:
        yield session
        session.rollback()

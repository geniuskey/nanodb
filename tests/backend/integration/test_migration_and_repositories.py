from __future__ import annotations

import pytest
from nanodb.domain.calculations import calculate_measurement
from nanodb.domain.entities import ImageType, ParameterType, Point
from nanodb.persistence.repositories import ImageRepository, MeasurementRepository
from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker


def create_image(repository: ImageRepository, suffix: str = "1") -> int:
    return repository.create(
        original_filename=f"sample-{suffix}.png",
        stored_filename=f"stored-{suffix}.png",
        image_type=ImageType.TEM,
        product_id="PRODUCT-01",
        lot_id="LOT-01",
        wafer_id="WAFER-01",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
    ).id


def test_empty_database_migration_creates_core_tables(
    database_engine: tuple[Engine, sessionmaker[Session]],
) -> None:
    engine, _ = database_engine
    tables = set(inspect(engine).get_table_names())

    assert {"alembic_version", "images", "measurements"} <= tables


def test_database_rejects_invalid_image_constraints(db_session: Session) -> None:
    with pytest.raises(IntegrityError), db_session.begin():
        db_session.execute(
            text(
                """
                    INSERT INTO images (
                        original_filename, stored_filename, image_type,
                        product_id, lot_id, wafer_id,
                        calibration_nm_per_pixel, pixel_width, pixel_height
                    ) VALUES (
                        'bad.png', 'bad.png', 'TEM',
                        'P', 'L', 'W', 0, 100, 100
                    )
                    """
            )
        )

    db_session.rollback()
    assert ImageRepository(db_session).count() == 0


def test_aggregate_list_and_measurement_order_are_deterministic(
    db_session: Session,
) -> None:
    images = ImageRepository(db_session)
    measurements = MeasurementRepository(db_session)
    first_id = create_image(images, "1")
    second_id = create_image(images, "2")
    for end_x in (10.0, 20.0):
        measurements.create(
            image_id=first_id,
            parameter_type=ParameterType.CD,
            start=Point(0, 0),
            end=Point(end_x, 0),
            calculation=calculate_measurement(
                Point(0, 0),
                Point(end_x, 0),
                0.2,
                pixel_width=1000,
                pixel_height=800,
            ),
            calibration_nm_per_pixel=0.2,
            note=None,
        )
    db_session.commit()

    items = images.list_with_measurement_count()
    newest = measurements.list_by_image(first_id)
    export = measurements.list_by_image(first_id, export_order=True)

    assert [item.image.id for item in items] == [second_id, first_id]
    assert [item.measurement_count for item in items] == [0, 2]
    assert [measurement.id for measurement in newest] == [2, 1]
    assert [measurement.id for measurement in export] == [1, 2]


def test_committed_data_is_visible_from_a_fresh_session(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image_id = create_image(ImageRepository(db_session))
    db_session.commit()
    _, factory = database_engine

    with factory() as restarted_session:
        restored = ImageRepository(restarted_session).find(image_id)

    assert restored is not None
    assert restored.original_filename == "sample-1.png"

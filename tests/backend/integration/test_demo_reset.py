"""US-01 integration test for the demo reset database-clearing path."""

from __future__ import annotations

from nanodb.persistence.models import (
    AnnotationModel,
    ImageModel,
    MeasurementModel,
)
from nanodb.persistence.repositories import ImageRepository, MeasurementRepository
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from scripts import reset_demo


def _seed_image_with_measurement_and_annotation(session: Session) -> None:
    image = ImageModel(
        original_filename="demo.png",
        stored_filename="demo-stored.png",
        image_type="TEM",
        product_id="P",
        lot_id="L",
        wafer_id="W",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
    )
    session.add(image)
    session.flush()
    session.add(
        MeasurementModel(
            image_id=image.id,
            parameter_type="CD",
            start_x=100,
            start_y=100,
            end_x=400,
            end_y=500,
            distance_px=500,
            calibration_nm_per_pixel=0.2,
            value_nm=100,
            note=None,
        )
    )
    # An annotation is what makes the image undeletable in bulk: its foreign
    # key to images is ON DELETE RESTRICT, same as a measurement's.
    session.add(
        AnnotationModel(
            image_id=image.id,
            kind="arrow",
            start_x=10,
            start_y=10,
            end_x=200,
            end_y=220,
            product="DRAM",
            step="STEP-1",
            measurement_name="CD",
        )
    )
    session.commit()


def test_clear_database_removes_all_runtime_rows(
    test_database_url: str,
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    _, factory = database_engine
    _seed_image_with_measurement_and_annotation(db_session)

    with factory() as session:
        assert ImageRepository(session).count() == 1
        assert MeasurementRepository(session).count() == 1
        assert session.scalar(select(func.count(AnnotationModel.id))) == 1

    image_count, measurement_count = reset_demo._clear_database(
        test_database_url,
        pool_size=1,
        max_overflow=0,
        pool_timeout=5.0,
    )

    assert image_count == 0
    assert measurement_count == 0
    with factory() as session:
        assert ImageRepository(session).count() == 0
        assert MeasurementRepository(session).count() == 0
        assert session.scalar(select(func.count(AnnotationModel.id))) == 0

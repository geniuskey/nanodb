from __future__ import annotations

import pytest
from nanodb.domain.calculations import calculate_measurement
from nanodb.domain.entities import ImageType, ParameterType, Point
from nanodb.persistence.repositories import ImageRepository, MeasurementRepository
from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker


def create_image(
    repository: ImageRepository,
    suffix: str = "1",
    process_step: str | None = None,
) -> int:
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
        process_step=process_step,
    ).id


def test_empty_database_migration_creates_core_tables(
    database_engine: tuple[Engine, sessionmaker[Session]],
) -> None:
    engine, _ = database_engine
    tables = set(inspect(engine).get_table_names())

    assert {"alembic_version", "images", "measurements"} <= tables
    # Shapes were folded into the measurement they describe; the standalone
    # table is gone rather than left behind empty.
    assert "annotations" not in tables


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
            label=None,
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


def test_list_filters_by_partial_text_and_image_type(db_session: Session) -> None:
    images = ImageRepository(db_session)
    images.create(
        original_filename="alpha.png",
        stored_filename="stored-alpha.png",
        image_type=ImageType.SEM,
        product_id="PRODUCT-42",
        lot_id="LOT-A",
        wafer_id="WAFER-1",
        calibration_nm_per_pixel=0.2,
        pixel_width=100,
        pixel_height=100,
    )
    images.create(
        original_filename="beta.png",
        stored_filename="stored-beta.png",
        image_type=ImageType.TEM,
        product_id="PRODUCT-99",
        lot_id="LOT-B",
        wafer_id="WAFER-2",
        calibration_nm_per_pixel=0.2,
        pixel_width=100,
        pixel_height=100,
    )
    db_session.commit()

    # Case-insensitive partial match against product/lot/wafer/filename.
    by_product = images.list_with_measurement_count(query="product-42")
    assert [item.image.original_filename for item in by_product] == ["alpha.png"]

    # Type filter narrows to a single kind.
    tem_only = images.list_with_measurement_count(image_type=ImageType.TEM)
    assert [item.image.original_filename for item in tem_only] == ["beta.png"]

    # Blank query keeps the whole catalog visible.
    assert len(images.list_with_measurement_count(query="   ")) == 2

    # Combined filters intersect (no SEM image matches LOT-B).
    assert images.list_with_measurement_count(
        query="LOT-B", image_type=ImageType.SEM
    ) == ()


def test_list_filters_by_process_step(db_session: Session) -> None:
    images = ImageRepository(db_session)
    create_image(images, "etch", process_step="Gate Etch")
    create_image(images, "depo", process_step="Poly Deposition")
    create_image(images, "none")
    db_session.commit()

    found = images.list_with_measurement_count(query="gate et")
    assert [item.image.original_filename for item in found] == ["sample-etch.png"]

    # An image registered without a step is simply never matched by one.
    matched = images.list_with_measurement_count(query="deposition")
    assert [item.image.process_step for item in matched] == ["Poly Deposition"]


def test_measurement_annotation_is_editable_and_scoped_to_its_image(
    db_session: Session,
) -> None:
    images = ImageRepository(db_session)
    measurements = MeasurementRepository(db_session)
    first_id = create_image(images, "1")
    second_id = create_image(images, "2")
    created = measurements.create(
        image_id=first_id,
        parameter_type=ParameterType.CD,
        start=Point(0, 0),
        end=Point(10, 0),
        calculation=calculate_measurement(
            Point(0, 0), Point(10, 0), 0.2, pixel_width=1000, pixel_height=800
        ),
        calibration_nm_per_pixel=0.2,
        label="Gate CD",
        note="첫 메모",
    )
    db_session.commit()

    assert measurements.list_by_image(first_id)[0].label == "Gate CD"

    # Only the annotation changes; the evidence under it stays as measured.
    updated = measurements.update_annotation(
        first_id, created.id, label="Gate CD (재확인)", note=None
    )
    assert updated is not None
    assert (updated.label, updated.note) == ("Gate CD (재확인)", None)
    assert (updated.start, updated.end) == (Point(0, 0), Point(10, 0))
    assert updated.value_nm == created.value_nm

    # An id from another image cannot be edited across the boundary.
    assert measurements.update_annotation(
        second_id, created.id, label="x", note=None
    ) is None

    # Cascade helper removes every measurement for an image.
    assert measurements.delete_by_image(first_id) == 1
    db_session.commit()
    assert measurements.list_by_image(first_id) == ()


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

from __future__ import annotations

import pytest
from nanodb.domain.calculations import calculate_measurement
from nanodb.domain.entities import MeasurementType, Point
from nanodb.persistence.repositories import (
    ImageRepository,
    MeasurementItemRepository,
    MeasurementRepository,
)
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
        image_type="TEM",
        product_id="PRODUCT-01",
        lot_id="LOT-01",
        wafer_id="WAFER-01",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
        process_step=process_step,
    ).id


def create_length(
    measurements: MeasurementRepository,
    image_id: int,
    end_x: float,
    *,
    calibration: float = 0.2,
    label: str | None = None,
    note: str | None = None,
) -> object:
    points = (Point(0, 0), Point(end_x, 0))
    return measurements.create(
        image_id=image_id,
        item_id=None,
        measurement_type=MeasurementType.LENGTH,
        points=points,
        result=calculate_measurement(
            MeasurementType.LENGTH,
            points,
            calibration,
            pixel_width=1000,
            pixel_height=800,
        ),
        calibration_nm_per_pixel=calibration,
        label=label,
        note=note,
    )


def test_empty_database_migration_creates_core_tables(
    database_engine: tuple[Engine, sessionmaker[Session]],
) -> None:
    engine, _ = database_engine
    tables = set(inspect(engine).get_table_names())

    assert {"alembic_version", "images", "measurements", "measurement_items"} <= tables
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
        create_length(measurements, first_id, end_x)
    db_session.commit()

    items = images.list_with_measurement_count()
    newest = measurements.list_by_image(first_id)
    export = measurements.list_by_image(first_id, export_order=True)

    assert [item.image.id for item in items] == [second_id, first_id]
    assert [item.measurement_count for item in items] == [0, 2]
    assert [measurement.id for measurement in newest] == [2, 1]
    assert [measurement.id for measurement in export] == [1, 2]


def test_aggregate_by_type_groups_only_measured_types(db_session: Session) -> None:
    images = ImageRepository(db_session)
    measurements = MeasurementRepository(db_session)
    image_id = create_image(images, "1")
    # Two lengths: 10px -> 2nm and 20px -> 4nm, mean 3nm.
    create_length(measurements, image_id, 10.0)
    create_length(measurements, image_id, 20.0)
    db_session.commit()

    stats = measurements.aggregate_by_type()

    assert [stat.measurement_type for stat in stats] == [MeasurementType.LENGTH]
    (length,) = stats
    assert (length.unit, length.count, length.mean) == ("nm", 2, 3.0)
    assert (length.min, length.max) == (2.0, 4.0)


def test_list_filters_by_partial_text_and_image_type(db_session: Session) -> None:
    images = ImageRepository(db_session)
    images.create(
        original_filename="alpha.png",
        stored_filename="stored-alpha.png",
        image_type="SEM",
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
        image_type="TEM",
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
    tem_only = images.list_with_measurement_count(image_type="TEM")
    assert [item.image.original_filename for item in tem_only] == ["beta.png"]

    # Blank query keeps the whole catalog visible.
    assert len(images.list_with_measurement_count(query="   ")) == 2

    # Combined filters intersect (no SEM image matches LOT-B).
    assert images.list_with_measurement_count(query="LOT-B", image_type="SEM") == ()

    # Product filter is an exact match, unlike the free-text query.
    by_product_exact = images.list_with_measurement_count(product_id="PRODUCT-99")
    assert [item.image.original_filename for item in by_product_exact] == ["beta.png"]
    assert images.list_with_measurement_count(product_id="PRODUCT-4") == ()

    # Product and type filters intersect (PRODUCT-42 is a SEM image, not TEM).
    assert (
        images.list_with_measurement_count(product_id="PRODUCT-42", image_type="TEM")
        == ()
    )


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


def test_measurement_items_are_scoped_and_unique_per_product(
    db_session: Session,
) -> None:
    items = MeasurementItemRepository(db_session)
    gate = items.create(
        product_id="PRODUCT-01",
        name="Active CD",
        measurement_type=MeasurementType.LENGTH,
    )
    items.create(
        product_id="PRODUCT-01", name="Gate CD", measurement_type=MeasurementType.LENGTH
    )
    items.create(
        product_id="PRODUCT-02", name="Gate CD", measurement_type=MeasurementType.LENGTH
    )
    db_session.commit()

    # Listed by name within one product, and a same name in another product is
    # a distinct item (unique only per product).
    listed = items.list_by_product("PRODUCT-01")
    assert [item.name for item in listed] == ["Active CD", "Gate CD"]
    assert items.exists("PRODUCT-01", "Gate CD") is True

    updated = items.update(
        gate.id, name="Gate CD (rev)", measurement_type=MeasurementType.LENGTH
    )
    assert updated is not None
    assert updated.name == "Gate CD (rev)"

    assert items.delete(gate.id) is True
    db_session.commit()
    assert [item.name for item in items.list_by_product("PRODUCT-01")] == ["Gate CD"]


def test_measurement_annotation_is_editable_and_scoped_to_its_image(
    db_session: Session,
) -> None:
    images = ImageRepository(db_session)
    measurements = MeasurementRepository(db_session)
    first_id = create_image(images, "1")
    second_id = create_image(images, "2")
    created = create_length(
        measurements, first_id, 10.0, label="Gate CD", note="첫 메모"
    )
    db_session.commit()

    assert measurements.list_by_image(first_id)[0].label == "Gate CD"

    # Only the annotation changes; the evidence under it stays as measured.
    updated = measurements.update_annotation(
        first_id, created.id, label="Gate CD (재확인)", note=None
    )
    assert updated is not None
    assert (updated.label, updated.note) == ("Gate CD (재확인)", None)
    assert updated.points == (Point(0, 0), Point(10, 0))
    assert updated.value == created.value

    # An id from another image cannot be edited across the boundary.
    assert (
        measurements.update_annotation(second_id, created.id, label="x", note=None)
        is None
    )

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

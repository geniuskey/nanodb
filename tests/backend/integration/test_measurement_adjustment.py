"""Integration tests for correcting a saved measurement's geometry.

Automatic extraction is not exact and a hand-placed point can miss, so points
are movable. These tests pin the two things that make that safe: the value is
recomputed on the server from the moved points (never accepted from a caller),
and the reading the measurement was produced with is preserved, so a correction
can be compared against the machine's answer and undone.
"""

from __future__ import annotations

import pytest
from nanodb.domain.calculations import calculate_measurement
from nanodb.domain.entities import MeasurementType, Point
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import ImageRepository
from nanodb.services.measurement_service import MeasurementInput, MeasurementService
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker


def _image(db_session: Session) -> int:
    image = ImageRepository(db_session).create(
        original_filename="sample.png",
        stored_filename="sample.png",
        image_type="TEM",
        product_id="P",
        lot_id="L",
        wafer_id="W",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
    )
    db_session.commit()
    return image.id


def _length(service: MeasurementService, image_id: int) -> object:
    return service.create(
        image_id,
        MeasurementInput(
            measurement_type=MeasurementType.LENGTH,
            points=(Point(100, 100), Point(400, 500)),
            label="Gate CD",
            note="처음 메모",
        ),
    )


def test_moving_points_revalues_from_them_and_keeps_the_first_reading(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image_id = _image(db_session)
    _, factory = database_engine
    service = MeasurementService(factory)
    created = _length(service, image_id)

    adjusted = service.update_geometry(
        image_id, created.id, points=(Point(100, 100), Point(400, 400))
    )

    expected = calculate_measurement(
        MeasurementType.LENGTH,
        (Point(100, 100), Point(400, 400)),
        0.2,
        pixel_width=1000,
        pixel_height=800,
    )
    assert adjusted.points == (Point(100, 100), Point(400, 400))
    assert adjusted.value == pytest.approx(expected.value)
    assert adjusted.is_adjusted
    # What it read when produced is still there to compare against.
    assert adjusted.original_points == created.points
    assert adjusted.original_value == pytest.approx(created.value)
    # What the measurement is stays as recorded.
    assert adjusted.measurement_type is created.measurement_type
    assert adjusted.calibration_nm_per_pixel == created.calibration_nm_per_pixel
    assert adjusted.unit == created.unit
    assert (adjusted.label, adjusted.note) == (created.label, created.note)


def test_a_second_correction_still_points_at_the_first_reading(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    """The trail records what was produced, not the previous edit.

    Otherwise a few rounds of nudging would quietly redefine "the original" as
    the last nudge, and the machine's answer would be gone.
    """
    image_id = _image(db_session)
    _, factory = database_engine
    service = MeasurementService(factory)
    created = _length(service, image_id)

    service.update_geometry(
        image_id, created.id, points=(Point(100, 100), Point(400, 400))
    )
    second = service.update_geometry(
        image_id, created.id, points=(Point(105, 100), Point(390, 405))
    )

    assert second.original_points == created.points
    assert second.original_value == pytest.approx(created.value)


def test_reverting_restores_the_produced_geometry_and_clears_the_trail(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image_id = _image(db_session)
    _, factory = database_engine
    service = MeasurementService(factory)
    created = _length(service, image_id)
    service.update_geometry(
        image_id, created.id, points=(Point(100, 100), Point(400, 400))
    )

    reverted = service.revert_geometry(image_id, created.id)

    assert reverted.points == created.points
    assert reverted.value == pytest.approx(created.value)
    assert not reverted.is_adjusted
    assert reverted.original_points is None
    assert reverted.original_value is None


def test_reverting_an_uncorrected_measurement_is_refused(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image_id = _image(db_session)
    _, factory = database_engine
    service = MeasurementService(factory)
    created = _length(service, image_id)

    with pytest.raises(DomainError) as info:
        service.revert_geometry(image_id, created.id)

    assert info.value.code == "MEASUREMENT_NOT_ADJUSTED"
    assert info.value.status == 409


def test_point_count_must_match_the_stored_type(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image_id = _image(db_session)
    _, factory = database_engine
    service = MeasurementService(factory)
    created = _length(service, image_id)

    with pytest.raises(DomainError) as info:
        service.update_geometry(
            image_id,
            created.id,
            points=(Point(1, 1), Point(2, 2), Point(3, 3)),
        )

    assert info.value.code == "INVALID_POINT_COUNT"
    assert info.value.field == "points"


def test_a_point_outside_the_image_is_refused(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image_id = _image(db_session)
    _, factory = database_engine
    service = MeasurementService(factory)
    created = _length(service, image_id)

    with pytest.raises(DomainError) as info:
        service.update_geometry(
            image_id, created.id, points=(Point(100, 100), Point(1200, 500))
        )

    assert info.value.code == "POINT_OUT_OF_BOUNDS"
    # Nothing was written: the measurement still reads as produced.
    assert not service.list_for_image(image_id)[0].is_adjusted


def test_a_degenerate_correction_is_refused(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image_id = _image(db_session)
    _, factory = database_engine
    service = MeasurementService(factory)
    created = _length(service, image_id)

    with pytest.raises(DomainError):
        service.update_geometry(
            image_id, created.id, points=(Point(100, 100), Point(100, 100))
        )


def test_correction_is_scoped_to_its_image(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image_id = _image(db_session)
    other = ImageRepository(db_session).create(
        original_filename="other.png",
        stored_filename="other.png",
        image_type="TEM",
        product_id="P",
        lot_id="L",
        wafer_id="W",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
    )
    db_session.commit()
    _, factory = database_engine
    service = MeasurementService(factory)
    created = _length(service, image_id)

    with pytest.raises(DomainError) as info:
        service.update_geometry(
            other.id, created.id, points=(Point(100, 100), Point(400, 400))
        )

    assert info.value.code == "MEASUREMENT_NOT_FOUND"


def test_an_angle_keeps_its_vertex_first_after_a_correction(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image_id = _image(db_session)
    _, factory = database_engine
    service = MeasurementService(factory)
    created = service.create(
        image_id,
        MeasurementInput(
            measurement_type=MeasurementType.ANGLE,
            points=(Point(200, 400), Point(200, 200), Point(300, 200)),
            label="측벽 각도",
        ),
    )

    adjusted = service.update_geometry(
        image_id,
        created.id,
        points=(Point(200, 400), Point(200, 200), Point(260, 200)),
    )

    expected = calculate_measurement(
        MeasurementType.ANGLE,
        adjusted.points,
        0.2,
        pixel_width=1000,
        pixel_height=800,
    )
    assert adjusted.value == pytest.approx(expected.value)
    assert adjusted.unit == "deg"
    assert adjusted.value != pytest.approx(created.value)

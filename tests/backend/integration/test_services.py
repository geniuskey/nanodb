from __future__ import annotations

import pytest
from nanodb.domain.entities import ImageType, ParameterType, Point
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import ImageRepository
from nanodb.services.context_export_service import ContextExportService
from nanodb.services.measurement_service import MeasurementInput, MeasurementService
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker


def test_measurement_service_recalculates_from_stored_image_calibration(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image = ImageRepository(db_session).create(
        original_filename="sample.png",
        stored_filename="sample.png",
        image_type=ImageType.TEM,
        product_id="P",
        lot_id="L",
        wafer_id="W",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
    )
    db_session.commit()
    _, factory = database_engine

    result = MeasurementService(factory).create(
        image.id,
        MeasurementInput(
            parameter_type=ParameterType.CD,
            start=Point(100, 100),
            end=Point(400, 500),
        ),
    )

    assert result.distance_px == 500
    assert result.value_nm == 100


def test_context_export_rejects_image_without_measurements(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image = ImageRepository(db_session).create(
        original_filename="sample.png",
        stored_filename="sample.png",
        image_type=ImageType.TEM,
        product_id="P",
        lot_id="L",
        wafer_id="W",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
    )
    db_session.commit()
    _, factory = database_engine

    with pytest.raises(DomainError) as caught:
        ContextExportService(factory).build(image.id)

    assert caught.value.code == "NO_MEASUREMENTS"

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from nanodb.adapters.file_store import FileStore
from nanodb.adapters.image_decoder import ImageDecoder
from nanodb.domain.entities import ImageType, ParameterType, Point
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import ImageRepository, MeasurementRepository
from nanodb.services.context_export_service import ContextExportService
from nanodb.services.image_service import ImageRegistration, ImageService
from nanodb.services.measurement_service import MeasurementInput, MeasurementService
from nanodb.services.summary_service import SummaryService
from PIL import Image as PillowImage
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


def test_summary_aggregates_per_parameter_mean_in_contract_order(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image = ImageRepository(db_session).create(
        original_filename="sample.png",
        stored_filename="sample.png",
        image_type=ImageType.SEM,
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
    # Two CD measurements (10nm, 20nm) and one Depth (30nm); no Thickness saved.
    service.create(
        image.id,
        MeasurementInput(ParameterType.CD, Point(0, 0), Point(50, 0)),
    )
    service.create(
        image.id,
        MeasurementInput(ParameterType.CD, Point(0, 0), Point(100, 0)),
    )
    service.create(
        image.id,
        MeasurementInput(ParameterType.DEPTH, Point(0, 0), Point(150, 0)),
    )

    summary = SummaryService(factory).get()

    assert summary.image_count == 1
    assert summary.measurement_count == 3
    aggregates = [
        (entry.parameter_type, entry.count, entry.mean_nm, entry.min_nm, entry.max_nm)
        for entry in summary.parameters
    ]
    # CD before Depth (contract order), Thickness absent because n=0.
    assert aggregates == [
        (ParameterType.CD, 2, 15.0, 10.0, 20.0),
        (ParameterType.DEPTH, 1, 30.0, 30.0, 30.0),
    ]


def test_measurement_delete_is_scoped_to_its_image(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    repository = ImageRepository(db_session)
    kept_image = repository.create(
        original_filename="kept.png",
        stored_filename="kept.png",
        image_type=ImageType.SEM,
        product_id="P",
        lot_id="L",
        wafer_id="W",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
    )
    other_image = repository.create(
        original_filename="other.png",
        stored_filename="other.png",
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
    service = MeasurementService(factory)
    on_kept = service.create(
        kept_image.id, MeasurementInput(ParameterType.CD, Point(0, 0), Point(50, 0))
    )
    on_other = service.create(
        other_image.id, MeasurementInput(ParameterType.CD, Point(0, 0), Point(50, 0))
    )

    # A measurement id from another image is not found under kept_image.
    with pytest.raises(DomainError) as cross_image:
        service.delete(kept_image.id, on_other.id)
    assert cross_image.value.code == "MEASUREMENT_NOT_FOUND"

    service.delete(kept_image.id, on_kept.id)

    assert service.list_for_image(kept_image.id) == ()
    assert [m.id for m in service.list_for_image(other_image.id)] == [on_other.id]


def test_measurement_delete_rejects_missing_image(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    _, factory = database_engine

    with pytest.raises(DomainError) as caught:
        MeasurementService(factory).delete(999, 1)

    assert caught.value.code == "IMAGE_NOT_FOUND"


def test_image_delete_cascades_measurements_and_removes_stored_file(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path: Path,
) -> None:
    _, factory = database_engine
    store = FileStore(tmp_path)
    image_service = ImageService(factory, store, ImageDecoder())

    content = BytesIO()
    PillowImage.new("L", (20, 20)).save(content, format="PNG")
    content.seek(0)
    image = image_service.register(
        content,
        ImageRegistration(
            original_filename="doomed.png",
            image_type=ImageType.SEM,
            product_id="P",
            lot_id="L",
            wafer_id="W",
            calibration_nm_per_pixel=0.2,
        ),
    )
    stored_path = tmp_path / image.stored_filename
    assert stored_path.is_file()
    MeasurementService(factory).create(
        image.id, MeasurementInput(ParameterType.CD, Point(0, 0), Point(10, 0))
    )

    image_service.delete(image.id)

    # Row, cascaded measurement and the stored file are all gone.
    assert not stored_path.exists()
    assert MeasurementRepository(db_session).count() == 0
    with pytest.raises(DomainError) as caught:
        image_service.get_image(image.id)
    assert caught.value.code == "IMAGE_NOT_FOUND"


def test_image_delete_rejects_missing_image(
    database_engine: tuple[Engine, sessionmaker[Session]],
    tmp_path: Path,
) -> None:
    _, factory = database_engine
    service = ImageService(factory, FileStore(tmp_path), ImageDecoder())

    with pytest.raises(DomainError) as caught:
        service.delete(999)

    assert caught.value.code == "IMAGE_NOT_FOUND"


def test_tiff_registration_stores_original_and_serves_png_derivative(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path: Path,
) -> None:
    _, factory = database_engine
    store = FileStore(tmp_path)
    image_service = ImageService(factory, store, ImageDecoder())

    content = BytesIO()
    PillowImage.new("RGB", (24, 16), color=(40, 60, 80)).save(content, format="TIFF")
    content.seek(0)
    image = image_service.register(
        content,
        ImageRegistration(
            original_filename="cross-section.tiff",
            image_type=ImageType.TEM,
            product_id="P",
            lot_id="L",
            wafer_id="W",
            calibration_nm_per_pixel=0.2,
        ),
    )

    # Original TIFF preserved, plus a distinct PNG derivative.
    assert image.stored_filename.endswith(".tif")
    assert image.display_filename is not None
    assert image.display_filename.endswith(".png")
    assert (tmp_path / image.stored_filename).is_file()
    assert (tmp_path / image.display_filename).is_file()

    # The served file is the browser-renderable PNG at the original size.
    served = image_service.image_path(image.id)
    assert served == tmp_path / image.display_filename
    with PillowImage.open(served) as rendered:
        assert rendered.format == "PNG"
        assert rendered.size == (24, 16)

    # Deleting the image removes both the original and the derivative.
    image_service.delete(image.id)
    assert not (tmp_path / image.stored_filename).exists()
    assert not (tmp_path / image.display_filename).exists()


def test_png_registration_has_no_display_derivative(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path: Path,
) -> None:
    _, factory = database_engine
    store = FileStore(tmp_path)
    image_service = ImageService(factory, store, ImageDecoder())

    content = BytesIO()
    PillowImage.new("RGB", (12, 12), color=(10, 10, 10)).save(content, format="PNG")
    content.seek(0)
    image = image_service.register(
        content,
        ImageRegistration(
            original_filename="wafer.png",
            image_type=ImageType.SEM,
            product_id="P",
            lot_id="L",
            wafer_id="W",
            calibration_nm_per_pixel=0.2,
        ),
    )

    # Browser can display the PNG directly, so no derivative is generated.
    assert image.display_filename is None
    assert image_service.image_path(image.id) == tmp_path / image.stored_filename


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

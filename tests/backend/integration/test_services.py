from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import pytest
from nanodb.adapters.file_store import FileStore
from nanodb.adapters.image_decoder import ImageDecoder
from nanodb.domain.entities import (
    ImageType,
    ParameterType,
    Point,
    ProductType,
    ShapeKind,
)
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import (
    AnnotationRepository,
    ImageRepository,
    MeasurementRepository,
)
from nanodb.services.annotation_service import (
    AnnotationInput,
    AnnotationService,
    AnnotationUpdate,
)
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


def test_annotation_service_persists_and_guards_inputs(
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
    service = AnnotationService(factory)

    created = service.create(
        image.id,
        AnnotationInput(kind=ShapeKind.CIRCLE, start=Point(50, 50), end=Point(70, 50)),
    )
    updated = service.update(
        image.id,
        created.id,
        AnnotationUpdate(
            product=ProductType.SENSOR, step="S1", measurement_name="hole"
        ),
    )
    assert updated.product is ProductType.SENSOR
    assert [a.id for a in service.list_for_image(image.id)] == [created.id]

    # A zero-size shape is rejected before it reaches the database.
    with pytest.raises(DomainError) as zero_size:
        service.create(
            image.id,
            AnnotationInput(kind=ShapeKind.ARROW, start=Point(5, 5), end=Point(5, 5)),
        )
    assert zero_size.value.code == "INVALID_ANNOTATION"

    # Creating against a missing image is rejected.
    with pytest.raises(DomainError) as missing_image:
        service.create(
            999,
            AnnotationInput(kind=ShapeKind.ARROW, start=Point(0, 0), end=Point(1, 1)),
        )
    assert missing_image.value.code == "IMAGE_NOT_FOUND"

    # Updating an unknown annotation id is reported distinctly.
    with pytest.raises(DomainError) as missing_annotation:
        service.update(
            image.id,
            999,
            AnnotationUpdate(product=None, step="", measurement_name=""),
        )
    assert missing_annotation.value.code == "ANNOTATION_NOT_FOUND"


def test_measurement_note_is_editable_while_its_evidence_is_not(
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
    service = MeasurementService(factory)
    created = service.create(
        image.id,
        MeasurementInput(
            parameter_type=ParameterType.CD,
            start=Point(100, 100),
            end=Point(400, 500),
            note="처음 메모",
        ),
    )

    updated = service.update_note(image.id, created.id, "다시 확인함")

    assert updated.note == "다시 확인함"
    # The evidence the value rests on is untouched.
    assert (updated.start, updated.end) == (created.start, created.end)
    assert updated.parameter_type is created.parameter_type
    assert updated.distance_px == created.distance_px
    assert updated.value_nm == created.value_nm
    assert updated.calibration_nm_per_pixel == created.calibration_nm_per_pixel
    assert updated.created_at == created.created_at

    # Clearing the note is allowed.
    assert service.update_note(image.id, created.id, None).note is None

    with pytest.raises(DomainError) as missing:
        service.update_note(image.id, 999, "x")
    assert missing.value.code == "MEASUREMENT_NOT_FOUND"


def test_context_export_carries_annotations_in_id_order(
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
    MeasurementService(factory).create(
        image.id,
        MeasurementInput(
            parameter_type=ParameterType.CD,
            start=Point(100, 100),
            end=Point(400, 500),
            note=None,
        ),
    )
    annotations = AnnotationService(factory)
    first = annotations.create(
        image.id,
        AnnotationInput(
            kind=ShapeKind.ARROW,
            start=Point(10, 10),
            end=Point(40, 40),
            product=ProductType.DRAM,
            step="증착",
            measurement_name="게이트 상단",
        ),
    )
    second = annotations.create(
        image.id,
        AnnotationInput(kind=ShapeKind.CIRCLE, start=Point(80, 80), end=Point(90, 80)),
    )

    archive = ContextExportService(factory).build(image.id)
    with ZipFile(BytesIO(archive)) as bundle:
        data = json.loads(bundle.read("data.json").decode("utf-8"))

    assert data["schema_version"] == "1.1"
    assert [shape["id"] for shape in data["annotations"]] == [first.id, second.id]
    assert data["annotations"][0]["measurement_name"] == "게이트 상단"
    assert data["annotations"][0]["product"] == "DRAM"
    assert data["annotations"][1]["product"] is None
    # The same snapshot exports identically apart from exported_at (CTX-012).
    again = ContextExportService(factory).build(image.id)
    with ZipFile(BytesIO(again)) as bundle:
        repeated = json.loads(bundle.read("data.json").decode("utf-8"))
    repeated["exported_at"] = data["exported_at"]
    assert repeated == data


def test_annotation_delete_is_scoped_to_its_image(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    repository = ImageRepository(db_session)
    first = repository.create(
        original_filename="first.png",
        stored_filename="first.png",
        image_type=ImageType.TEM,
        product_id="P",
        lot_id="L",
        wafer_id="W",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
    )
    second = repository.create(
        original_filename="second.png",
        stored_filename="second.png",
        image_type=ImageType.SEM,
        product_id="P",
        lot_id="L",
        wafer_id="W2",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
    )
    db_session.commit()
    _, factory = database_engine
    service = AnnotationService(factory)
    shape = service.create(
        first.id,
        AnnotationInput(kind=ShapeKind.ARROW, start=Point(10, 10), end=Point(40, 40)),
    )

    # Guessing the id from another image must not delete across images.
    with pytest.raises(DomainError) as cross_image:
        service.delete(second.id, shape.id)
    assert cross_image.value.code == "ANNOTATION_NOT_FOUND"
    assert [a.id for a in service.list_for_image(first.id)] == [shape.id]

    service.delete(first.id, shape.id)
    assert service.list_for_image(first.id) == ()

    # Deleting it twice, or against a missing image, is reported distinctly.
    with pytest.raises(DomainError) as missing_shape:
        service.delete(first.id, shape.id)
    assert missing_shape.value.code == "ANNOTATION_NOT_FOUND"
    with pytest.raises(DomainError) as missing_image:
        service.delete(999, shape.id)
    assert missing_image.value.code == "IMAGE_NOT_FOUND"


def test_annotation_delete_keeps_saved_measurements(
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
    measurement = MeasurementService(factory).create(
        image.id,
        MeasurementInput(
            parameter_type=ParameterType.CD,
            start=Point(100, 100),
            end=Point(400, 500),
            note=None,
        ),
    )
    annotation_service = AnnotationService(factory)
    shape = annotation_service.create(
        image.id,
        AnnotationInput(kind=ShapeKind.CIRCLE, start=Point(50, 50), end=Point(70, 50)),
    )

    annotation_service.delete(image.id, shape.id)

    # A shape is a reference label: removing one leaves measured data intact.
    stored = MeasurementService(factory).list_for_image(image.id)
    assert [item.id for item in stored] == [measurement.id]


def test_image_delete_cascades_annotations(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path: Path,
) -> None:
    _, factory = database_engine
    image_service = ImageService(factory, FileStore(tmp_path), ImageDecoder())

    content = BytesIO()
    PillowImage.new("L", (20, 20)).save(content, format="PNG")
    content.seek(0)
    image = image_service.register(
        content,
        ImageRegistration(
            original_filename="labeled.png",
            image_type=ImageType.TEM,
            product_id="P",
            lot_id="L",
            wafer_id="W",
            calibration_nm_per_pixel=0.2,
        ),
    )
    AnnotationService(factory).create(
        image.id,
        AnnotationInput(kind=ShapeKind.ARROW, start=Point(0, 0), end=Point(10, 10)),
    )

    # RESTRICT FK means the delete only succeeds if annotations are cascaded first.
    image_service.delete(image.id)

    assert AnnotationRepository(db_session).list_by_image(image.id) == ()
    with pytest.raises(DomainError) as caught:
        image_service.get_image(image.id)
    assert caught.value.code == "IMAGE_NOT_FOUND"


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

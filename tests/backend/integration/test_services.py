from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import pytest
from nanodb.adapters.derived_store import DerivedStore
from nanodb.adapters.file_store import FileStore
from nanodb.adapters.image_decoder import ImageDecoder
from nanodb.domain.entities import CatalogCategory, MeasurementType, Point
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import ImageRepository, MeasurementRepository
from nanodb.services.catalog_service import CatalogService
from nanodb.services.context_export_service import ContextExportService
from nanodb.services.image_service import ImageRegistration, ImageService, ImageUpdate
from nanodb.services.measurement_service import MeasurementInput, MeasurementService
from nanodb.services.summary_service import SummaryService
from PIL import Image as PillowImage
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker


def length_input(
    end_x: float,
    end_y: float = 0.0,
    *,
    start: Point | None = None,
    label: str | None = None,
    note: str | None = None,
) -> MeasurementInput:
    return MeasurementInput(
        measurement_type=MeasurementType.LENGTH,
        points=(start or Point(0, 0), Point(end_x, end_y)),
        label=label,
        note=note,
    )


def test_measurement_service_recalculates_from_stored_image_calibration(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
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
    _, factory = database_engine

    result = MeasurementService(factory).create(
        image.id,
        MeasurementInput(
            measurement_type=MeasurementType.LENGTH,
            points=(Point(100, 100), Point(400, 500)),
        ),
    )

    assert result.value == 100
    assert result.unit == "nm"


def test_summary_aggregates_per_type_mean_in_contract_order(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    image = ImageRepository(db_session).create(
        original_filename="sample.png",
        stored_filename="sample.png",
        image_type="SEM",
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
    # Two lengths (10nm, 20nm) and one right angle (90deg); no curvature saved.
    service.create(image.id, length_input(50))
    service.create(image.id, length_input(100))
    service.create(
        image.id,
        MeasurementInput(
            measurement_type=MeasurementType.ANGLE,
            points=(Point(0, 0), Point(50, 0), Point(0, 50)),
        ),
    )

    summary = SummaryService(factory).get()

    assert summary.image_count == 1
    assert summary.measurement_count == 3
    aggregates = [
        (
            entry.measurement_type,
            entry.unit,
            entry.count,
            entry.mean,
            entry.min,
            entry.max,
        )
        for entry in summary.types
    ]
    # Length before angle (contract order), curvature absent because n=0.
    assert aggregates == [
        (MeasurementType.LENGTH, "nm", 2, 15.0, 10.0, 20.0),
        (MeasurementType.ANGLE, "deg", 1, 90.0, 90.0, 90.0),
    ]


def test_measurement_delete_is_scoped_to_its_image(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    repository = ImageRepository(db_session)
    kept_image = repository.create(
        original_filename="kept.png",
        stored_filename="kept.png",
        image_type="SEM",
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
    on_kept = service.create(kept_image.id, length_input(50))
    on_other = service.create(other_image.id, length_input(50))

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


def test_measurement_rejects_item_type_or_product_mismatch(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    from nanodb.persistence.repositories import MeasurementItemRepository

    images = ImageRepository(db_session)
    image = images.create(
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
    items = MeasurementItemRepository(db_session)
    angle_item = items.create(
        product_id="P", name="코너 각도", measurement_type=MeasurementType.ANGLE
    )
    other_product_item = items.create(
        product_id="OTHER", name="Gate CD", measurement_type=MeasurementType.LENGTH
    )
    db_session.commit()
    _, factory = database_engine
    service = MeasurementService(factory)

    # Length drawn against an angle item: the drawing tool and the definition disagree.
    with pytest.raises(DomainError) as mismatch:
        service.create(
            image.id,
            MeasurementInput(
                measurement_type=MeasurementType.LENGTH,
                points=(Point(0, 0), Point(50, 0)),
                item_id=angle_item.id,
            ),
        )
    assert mismatch.value.code == "MEASUREMENT_TYPE_MISMATCH"

    # An item from another product cannot be used on this image.
    with pytest.raises(DomainError) as wrong_product:
        service.create(
            image.id,
            MeasurementInput(
                measurement_type=MeasurementType.LENGTH,
                points=(Point(0, 0), Point(50, 0)),
                item_id=other_product_item.id,
            ),
        )
    assert wrong_product.value.code == "MEASUREMENT_ITEM_PRODUCT_MISMATCH"


def test_image_delete_cascades_measurements_and_removes_stored_file(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path: Path,
) -> None:
    _, factory = database_engine
    store = FileStore(tmp_path)
    image_service = ImageService(factory, store, ImageDecoder(), DerivedStore(tmp_path))

    content = BytesIO()
    PillowImage.new("L", (20, 20)).save(content, format="PNG")
    content.seek(0)
    image = image_service.register(
        content,
        ImageRegistration(
            original_filename="doomed.png",
            image_type="SEM",
            product_id="P",
            lot_id="L",
            wafer_id="W",
            calibration_nm_per_pixel=0.2,
        ),
    )
    stored_path = tmp_path / image.stored_filename
    assert stored_path.is_file()
    MeasurementService(factory).create(image.id, length_input(10))

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
    service = ImageService(
        factory, FileStore(tmp_path), ImageDecoder(), DerivedStore(tmp_path)
    )

    with pytest.raises(DomainError) as caught:
        service.delete(999)

    assert caught.value.code == "IMAGE_NOT_FOUND"


def test_image_update_saves_fields_grows_catalog_and_spares_existing_values(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path: Path,
) -> None:
    _, factory = database_engine
    image_service = ImageService(
        factory, FileStore(tmp_path), ImageDecoder(), DerivedStore(tmp_path)
    )
    content = BytesIO()
    PillowImage.new("L", (1000, 800)).save(content, format="PNG")
    content.seek(0)
    image = image_service.register(
        content,
        ImageRegistration(
            original_filename="wafer.png",
            image_type="SEM",
            product_id="P",
            lot_id="L",
            wafer_id="W",
            calibration_nm_per_pixel=0.2,
        ),
    )
    # A measurement made under the original calibration: 300px -> 60nm.
    existing = MeasurementService(factory).create(image.id, length_input(300))
    assert existing.value == 60

    updated = image_service.update(
        image.id,
        ImageUpdate(
            image_type="  TEM  ",
            product_id="  P2  ",
            lot_id="  L2  ",
            wafer_id="  W2  ",
            calibration_nm_per_pixel=0.5,
            process_step="  Gate Etch  ",
            note="  재보정 완료  ",
        ),
    )

    # Fields are trimmed and persisted; the file and pixel size are untouched.
    assert updated.image_type == "TEM"
    assert updated.product_id == "P2"
    assert updated.process_step == "Gate Etch"
    assert updated.note == "재보정 완료"
    assert updated.calibration_nm_per_pixel == 0.5
    assert updated.original_filename == "wafer.png"
    assert updated.pixel_width == 1000

    # The reload reflects the change, the new values joined the catalog, and the
    # measurement taken earlier keeps the value it was computed with.
    reloaded = image_service.get_image(image.id)
    assert reloaded.image_type == "TEM"
    values = {option.value for option in CatalogService(factory).list_all()}
    assert {"TEM", "P2", "L2", "W2", "Gate Etch"} <= values
    kept = MeasurementRepository(db_session).list_by_image(image.id)
    assert kept[0].value == 60
    assert kept[0].calibration_nm_per_pixel == 0.2
    # A fresh measurement now uses the corrected calibration: 300px -> 150nm.
    assert MeasurementService(factory).create(image.id, length_input(300)).value == 150


def test_image_update_rejects_missing_image(
    database_engine: tuple[Engine, sessionmaker[Session]],
    tmp_path: Path,
) -> None:
    _, factory = database_engine
    service = ImageService(
        factory, FileStore(tmp_path), ImageDecoder(), DerivedStore(tmp_path)
    )

    with pytest.raises(DomainError) as caught:
        service.update(
            999,
            ImageUpdate(
                image_type="TEM",
                product_id="P",
                lot_id="L",
                wafer_id="W",
                calibration_nm_per_pixel=0.2,
            ),
        )

    assert caught.value.code == "IMAGE_NOT_FOUND"


def test_tiff_registration_stores_original_and_serves_png_derivative(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path: Path,
) -> None:
    _, factory = database_engine
    store = FileStore(tmp_path)
    image_service = ImageService(factory, store, ImageDecoder(), DerivedStore(tmp_path))

    content = BytesIO()
    PillowImage.new("RGB", (24, 16), color=(40, 60, 80)).save(content, format="TIFF")
    content.seek(0)
    image = image_service.register(
        content,
        ImageRegistration(
            original_filename="cross-section.tiff",
            image_type="TEM",
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
    image_service = ImageService(factory, store, ImageDecoder(), DerivedStore(tmp_path))

    content = BytesIO()
    PillowImage.new("RGB", (12, 12), color=(10, 10, 10)).save(content, format="PNG")
    content.seek(0)
    image = image_service.register(
        content,
        ImageRegistration(
            original_filename="wafer.png",
            image_type="SEM",
            product_id="P",
            lot_id="L",
            wafer_id="W",
            calibration_nm_per_pixel=0.2,
        ),
    )

    # Browser can display the PNG directly, so no derivative is generated.
    assert image.display_filename is None
    assert image_service.image_path(image.id) == tmp_path / image.stored_filename


def test_measurement_annotation_is_editable_while_its_evidence_is_not(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
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
    _, factory = database_engine
    service = MeasurementService(factory)
    created = service.create(
        image.id,
        MeasurementInput(
            measurement_type=MeasurementType.LENGTH,
            points=(Point(100, 100), Point(400, 500)),
            label="Gate CD",
            note="처음 메모",
        ),
    )

    updated = service.update_annotation(
        image.id, created.id, label="Gate CD 재확인", note="다시 확인함"
    )

    assert (updated.label, updated.note) == ("Gate CD 재확인", "다시 확인함")
    # The evidence the value rests on is untouched.
    assert updated.points == created.points
    assert updated.measurement_type is created.measurement_type
    assert updated.value == created.value
    assert updated.unit == created.unit
    assert updated.calibration_nm_per_pixel == created.calibration_nm_per_pixel
    assert updated.created_at == created.created_at

    # Clearing either half of the annotation is allowed.
    cleared = service.update_annotation(image.id, created.id, label=None, note=None)
    assert (cleared.label, cleared.note) == (None, None)

    with pytest.raises(DomainError) as missing:
        service.update_annotation(image.id, 999, label=None, note="x")
    assert missing.value.code == "MEASUREMENT_NOT_FOUND"


def test_context_export_carries_measurement_annotations(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
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
        process_step="Gate Etch",
    )
    db_session.commit()
    _, factory = database_engine
    service = MeasurementService(factory)
    labelled = service.create(
        image.id,
        MeasurementInput(
            measurement_type=MeasurementType.LENGTH,
            points=(Point(100, 100), Point(400, 500)),
            label="게이트 상단",
            note="재확인 필요",
        ),
    )
    bare = service.create(
        image.id,
        MeasurementInput(
            measurement_type=MeasurementType.LENGTH,
            points=(Point(80, 80), Point(90, 80)),
            note=None,
        ),
    )

    archive = ContextExportService(factory).build(image.id)
    with ZipFile(BytesIO(archive)) as bundle:
        data = json.loads(bundle.read("data.json").decode("utf-8"))

    assert data["schema_version"] == "3.1"
    assert data["image"]["process_step"] == "Gate Etch"
    assert [item["id"] for item in data["measurements"]] == [labelled.id, bare.id]
    assert data["measurements"][0]["label"] == "게이트 상단"
    assert data["measurements"][0]["note"] == "재확인 필요"
    assert data["measurements"][0]["measurement_type"] == "length"
    assert data["measurements"][0]["points"] == [[100, 100], [400, 500]]
    # An unlabelled measurement exports its empty annotation as null, never
    # as an invented name.
    assert data["measurements"][1]["label"] is None
    # The same snapshot exports identically apart from exported_at (CTX-012).
    again = ContextExportService(factory).build(image.id)
    with ZipFile(BytesIO(again)) as bundle:
        repeated = json.loads(bundle.read("data.json").decode("utf-8"))
    repeated["exported_at"] = data["exported_at"]
    assert repeated == data


def test_image_delete_cascades_measurements(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path: Path,
) -> None:
    _, factory = database_engine
    image_service = ImageService(
        factory, FileStore(tmp_path), ImageDecoder(), DerivedStore(tmp_path)
    )

    content = BytesIO()
    PillowImage.new("L", (20, 20)).save(content, format="PNG")
    content.seek(0)
    image = image_service.register(
        content,
        ImageRegistration(
            original_filename="measured.png",
            image_type="TEM",
            product_id="P",
            lot_id="L",
            wafer_id="W",
            calibration_nm_per_pixel=0.2,
        ),
    )
    MeasurementService(factory).create(
        image.id,
        MeasurementInput(
            measurement_type=MeasurementType.LENGTH,
            points=(Point(0, 0), Point(10, 10)),
            note=None,
        ),
    )

    # RESTRICT FK means the delete only succeeds if measurements are cascaded first.
    image_service.delete(image.id)

    assert MeasurementRepository(db_session).list_by_image(image.id) == ()
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

    with pytest.raises(DomainError) as caught:
        ContextExportService(factory).build(image.id)

    assert caught.value.code == "NO_MEASUREMENTS"


def test_catalog_seeds_defaults_and_grows_from_registration(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path: Path,
) -> None:
    _, factory = database_engine
    service = CatalogService(factory)

    # The migration seeds TEM/SEM and W01-W25 as predefined baselines.
    seeded = service.list_all()
    image_types = {o.value for o in seeded if o.category is CatalogCategory.IMAGE_TYPE}
    wafer_ids = {o.value for o in seeded if o.category is CatalogCategory.WAFER_ID}
    assert {"TEM", "SEM"} <= image_types
    assert {"W01", "W25"} <= wafer_ids
    assert all(o.is_predefined for o in seeded if o.value in {"TEM", "W01"})

    # Registering an image records its free-text values so the lists grow.
    store = FileStore(tmp_path)
    buffer = BytesIO()
    PillowImage.new("RGB", (1000, 800), "white").save(buffer, format="PNG")
    buffer.seek(0)
    ImageService(factory, store, ImageDecoder(), DerivedStore(tmp_path)).register(
        buffer,
        ImageRegistration(
            original_filename="sample.png",
            image_type="STEM",
            product_id="P-NEW",
            lot_id="L-NEW",
            wafer_id="W07",
            process_step="Gate Etch",
            calibration_nm_per_pixel=0.2,
        ),
    )

    after = service.list_all()
    before_pairs = {(o.category, o.value) for o in seeded}
    added = {(o.category, o.value) for o in after} - before_pairs
    assert (CatalogCategory.IMAGE_TYPE, "STEM") in added
    assert (CatalogCategory.PRODUCT_ID, "P-NEW") in added
    assert (CatalogCategory.PROCESS_STEP, "Gate Etch") in added
    # W07 was already a predefined wafer id, so it is not duplicated.
    assert sum(1 for o in after if o.value == "W07") == 1
    assert all(not o.is_predefined for o in after if o.value in {"STEM", "P-NEW"})


def test_catalog_create_rejects_duplicate_and_delete_protects_predefined(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    _, factory = database_engine
    service = CatalogService(factory)

    created = service.create(CatalogCategory.LOT_ID, "  L-42  ")
    assert created.value == "L-42"
    assert created.is_predefined is False

    with pytest.raises(DomainError) as duplicate:
        service.create(CatalogCategory.LOT_ID, "L-42")
    assert duplicate.value.code == "DUPLICATE_OPTION"

    predefined = next(
        o
        for o in service.list_all()
        if o.category is CatalogCategory.IMAGE_TYPE and o.value == "TEM"
    )
    with pytest.raises(DomainError) as protected:
        service.delete(predefined.id)
    assert protected.value.code == "PREDEFINED_OPTION"

    with pytest.raises(DomainError) as missing:
        service.delete(999999)
    assert missing.value.code == "OPTION_NOT_FOUND"

    service.delete(created.id)
    assert all(o.id != created.id for o in service.list_all())


def test_catalog_rename_changes_value_and_protects_predefined(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
) -> None:
    _, factory = database_engine
    service = CatalogService(factory)

    created = service.create(CatalogCategory.PRODUCT_ID, "P-DRAM")
    renamed = service.rename(created.id, "  P-DRAM-2  ")
    assert renamed.value == "P-DRAM-2"
    assert renamed.id == created.id

    # A predefined value cannot be renamed.
    predefined = next(
        o
        for o in service.list_all()
        if o.category is CatalogCategory.IMAGE_TYPE and o.value == "TEM"
    )
    with pytest.raises(DomainError) as protected:
        service.rename(predefined.id, "TEM-X")
    assert protected.value.code == "PREDEFINED_OPTION"

    # Renaming onto an existing value in the same category is a duplicate.
    other = service.create(CatalogCategory.PRODUCT_ID, "P-NAND")
    with pytest.raises(DomainError) as duplicate:
        service.rename(other.id, "P-DRAM-2")
    assert duplicate.value.code == "DUPLICATE_OPTION"

    with pytest.raises(DomainError) as missing:
        service.rename(999999, "whatever")
    assert missing.value.code == "OPTION_NOT_FOUND"

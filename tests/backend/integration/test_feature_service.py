"""Integration tests for the feature-extraction service.

These exercise the full path: register an image, run segmentation to persist a
label map, then extract features. They assert the two provenance invariants --
auto measurements are stored as ``AUTO`` with a confidence, and a re-run replaces
only the auto rows while manual rows survive -- and that every stored auto value
recomputes from its points (the export-consistency contract).
"""

from __future__ import annotations

from io import BytesIO

import numpy as np
import pytest
from nanodb.adapters.derived_store import DerivedStore
from nanodb.adapters.file_store import FileStore
from nanodb.adapters.image_decoder import ImageDecoder
from nanodb.domain.calculations import calculate_measurement
from nanodb.domain.entities import MeasurementSource, MeasurementType, Point
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import MeasurementRepository
from nanodb.services.feature_service import (
    FeatureExtractionService,
    FeatureParams,
)
from nanodb.services.image_service import ImageRegistration, ImageService
from nanodb.services.measurement_service import MeasurementInput, MeasurementService
from nanodb.services.segmentation_service import SegmentationParams, SegmentationService
from PIL import Image as PillowImage
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker


def _register_structured_image(
    factory: sessionmaker[Session], tmp_path
) -> tuple[int, ImageService]:  # type: ignore[no-untyped-def]
    """Register a PNG with a clear dark structure on a bright background."""
    array = np.full((200, 200), 230, dtype=np.uint8)
    top, bottom = 40, 160
    for y in range(top, bottom):
        frac = (y - top) / (bottom - top)
        half = int(round(40 - 15 * frac))
        array[y, 100 - half : 100 + half] = 20
    buffer = BytesIO()
    PillowImage.fromarray(array).convert("RGB").save(buffer, format="PNG")
    buffer.seek(0)

    store = FileStore(tmp_path)
    image_service = ImageService(
        factory, store, ImageDecoder(), DerivedStore(tmp_path)
    )
    image = image_service.register(
        buffer,
        ImageRegistration(
            original_filename="structure.png",
            image_type="TEM",
            product_id="P",
            lot_id="L",
            wafer_id="W",
            calibration_nm_per_pixel=0.5,
        ),
    )
    return image.id, image_service


def _services(
    factory: sessionmaker[Session], tmp_path
) -> tuple[SegmentationService, FeatureExtractionService]:  # type: ignore[no-untyped-def]
    file_store = FileStore(tmp_path)
    derived = DerivedStore(tmp_path)
    segmentation = SegmentationService(factory, file_store, derived)
    features = FeatureExtractionService(factory, derived, segmentation)
    return segmentation, features


def test_extracting_before_segmentation_reports_not_found(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path,  # type: ignore[no-untyped-def]
) -> None:
    _, factory = database_engine
    image_id, _ = _register_structured_image(factory, tmp_path)
    _segmentation, features = _services(factory, tmp_path)

    with pytest.raises(DomainError) as info:
        features.run(image_id, FeatureParams())

    assert info.value.code == "SEGMENTATION_NOT_FOUND"


def test_features_are_stored_as_auto_with_confidence(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path,  # type: ignore[no-untyped-def]
) -> None:
    _, factory = database_engine
    image_id, _ = _register_structured_image(factory, tmp_path)
    segmentation, features = _services(factory, tmp_path)
    segmentation.run(image_id, SegmentationParams(classes=2))

    run = features.run(image_id, FeatureParams(target_class=0))

    assert run.measurements
    for measurement in run.measurements:
        assert measurement.source is MeasurementSource.AUTO
        assert measurement.confidence is not None
        assert 0.0 <= measurement.confidence <= 1.0
        assert measurement.label is not None and measurement.label.startswith("auto:")


def test_stored_auto_values_recompute_from_their_points(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path,  # type: ignore[no-untyped-def]
) -> None:
    _, factory = database_engine
    image_id, _ = _register_structured_image(factory, tmp_path)
    segmentation, features = _services(factory, tmp_path)
    segmentation.run(image_id, SegmentationParams(classes=2))

    run = features.run(image_id, FeatureParams(target_class=0))

    for measurement in run.measurements:
        result = calculate_measurement(
            measurement.measurement_type,
            measurement.points,
            measurement.calibration_nm_per_pixel,
            pixel_width=200,
            pixel_height=200,
        )
        assert abs(measurement.value - result.value) < 1e-9
        assert measurement.unit == result.unit


def test_rerun_replaces_auto_but_keeps_manual_measurements(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path,  # type: ignore[no-untyped-def]
) -> None:
    _, factory = database_engine
    image_id, _ = _register_structured_image(factory, tmp_path)
    segmentation, features = _services(factory, tmp_path)
    segmentation.run(image_id, SegmentationParams(classes=2))

    manual = MeasurementService(factory).create(
        image_id,
        MeasurementInput(
            measurement_type=MeasurementType.LENGTH,
            points=(Point(10, 10), Point(50, 10)),
            label="operator CD",
        ),
    )

    first = features.run(image_id, FeatureParams(target_class=0))
    second = features.run(image_id, FeatureParams(target_class=0))

    stored = MeasurementRepository(db_session).list_by_image(image_id)
    auto = [m for m in stored if m.source is MeasurementSource.AUTO]
    manual_rows = [m for m in stored if m.source is MeasurementSource.MANUAL]

    # The manual row survives both runs; the auto rows are replaced, not appended.
    assert [m.id for m in manual_rows] == [manual.id]
    assert len(auto) == len(second.measurements)
    first_ids = {m.id for m in first.measurements}
    second_ids = {m.id for m in second.measurements}
    assert first_ids.isdisjoint(second_ids)


def test_extract_rejects_out_of_range_target_class(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path,  # type: ignore[no-untyped-def]
) -> None:
    _, factory = database_engine
    image_id, _ = _register_structured_image(factory, tmp_path)
    _segmentation, features = _services(factory, tmp_path)

    with pytest.raises(DomainError) as info:
        features.run(image_id, FeatureParams(target_class=99))

    assert info.value.code == "INVALID_TARGET_CLASS"


def test_uniform_class_region_reports_no_feature_region(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path,  # type: ignore[no-untyped-def]
) -> None:
    _, factory = database_engine
    image_id, _ = _register_structured_image(factory, tmp_path)
    segmentation, features = _services(factory, tmp_path)
    segmentation.run(image_id, SegmentationParams(classes=2))

    # The bright background class has a huge region; a class that is essentially
    # absent yields no measurable region.
    with pytest.raises(DomainError) as info:
        features.run(image_id, FeatureParams(target_class=5, min_area=1_000_000))

    assert info.value.code == "NO_FEATURE_REGION"


def test_rerun_keeps_an_auto_measurement_a_person_corrected(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path,  # type: ignore[no-untyped-def]
) -> None:
    """A correction is human work the extractor cannot reproduce.

    Auto rows are replaced on a re-run, but once an operator has moved the
    points of one, wiping it would destroy their judgement silently -- and they
    would only notice by the value changing back.
    """
    _, factory = database_engine
    image_id, _ = _register_structured_image(factory, tmp_path)
    segmentation, features = _services(factory, tmp_path)
    segmentation.run(image_id, SegmentationParams(classes=2))
    measurements = MeasurementService(factory)

    first = features.run(image_id, FeatureParams(target_class=0))
    corrected_target = next(
        m for m in first.measurements if m.measurement_type is MeasurementType.LENGTH
    )
    untouched_ids = {m.id for m in first.measurements} - {corrected_target.id}
    corrected = measurements.update_geometry(
        image_id,
        corrected_target.id,
        points=(Point(12.0, 30.0), Point(64.0, 30.0)),
    )

    second = features.run(image_id, FeatureParams(target_class=0))

    rows = MeasurementRepository(db_session).list_by_image(image_id)
    stored = {m.id: m for m in rows}
    assert corrected.id in stored
    assert stored[corrected.id].points == corrected.points
    assert stored[corrected.id].is_adjusted
    # Every auto row the operator had not touched was still replaced.
    assert untouched_ids.isdisjoint(stored)
    assert second.preserved_adjusted == 1


def test_rerun_reports_no_preserved_rows_when_nothing_was_corrected(
    database_engine: tuple[Engine, sessionmaker[Session]],
    db_session: Session,
    tmp_path,  # type: ignore[no-untyped-def]
) -> None:
    _, factory = database_engine
    image_id, _ = _register_structured_image(factory, tmp_path)
    segmentation, features = _services(factory, tmp_path)
    segmentation.run(image_id, SegmentationParams(classes=2))

    features.run(image_id, FeatureParams(target_class=0))
    second = features.run(image_id, FeatureParams(target_class=0))

    assert second.preserved_adjusted == 0

"""Derive auto measurements from a stored segmentation label map.

The extractor turns each structural feature into an app measurement whose value
the server recomputes from its points, then persists it with ``source = AUTO``
and a confidence. Auto measurements are never presented as a verified reference:
a prior extraction's auto rows are replaced on each run, and human (manual) rows
are never touched. After persisting, the segmentation's TIFF ``features`` tag is
refreshed so the derived copy carries the same values.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session, sessionmaker

from nanodb.adapters.derived_store import DerivedStore
from nanodb.domain.calculations import MeasurementResult, calculate_measurement
from nanodb.domain.entities import Image, Measurement, MeasurementSource
from nanodb.domain.errors import DomainError
from nanodb.domain.features import (
    FeatureExtraction,
    FeaturePrimitive,
    extract_features,
)
from nanodb.persistence.repositories import (
    ImageRepository,
    MeasurementRepository,
    SegmentationResultRepository,
)
from nanodb.services.segmentation_service import SegmentationService

LOGGER = logging.getLogger("nanodb.features")


@dataclass(frozen=True, slots=True)
class FeatureParams:
    target_class: int = 0
    min_area: int = 200
    curvature_frac: float = 0.6
    sidewall_band: tuple[float, float] = (0.2, 0.8)
    max_radius_factor: float = 3.0


@dataclass(frozen=True, slots=True)
class SkippedFeatureView:
    key: str
    reason: str


@dataclass(frozen=True, slots=True)
class FeatureExtractionRun:
    image_id: int
    target_class: int
    region_area_px: int
    region_clipped: bool
    measurements: tuple[Measurement, ...]
    skipped: tuple[SkippedFeatureView, ...]


class FeatureExtractionService:
    def __init__(
        self,
        session_factory: sessionmaker[Session],
        derived_store: DerivedStore,
        segmentation_service: SegmentationService,
    ) -> None:
        self._session_factory = session_factory
        self._derived_store = derived_store
        self._segmentation = segmentation_service

    def _load_image(self, session: Session, image_id: int) -> Image:
        image = ImageRepository(session).find(image_id)
        if image is None:
            raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
        return image

    def _validate(self, params: FeatureParams) -> None:
        if not 0 <= params.target_class <= 5:
            raise DomainError(
                "INVALID_TARGET_CLASS",
                "target_class must be between 0 and 5.",
                field="target_class",
            )
        if params.min_area < 0:
            raise DomainError(
                "INVALID_MIN_AREA",
                "min_area must be zero or greater.",
                field="min_area",
            )
        lo, hi = params.sidewall_band
        if not (0.0 <= lo < hi <= 1.0):
            raise DomainError(
                "INVALID_SIDEWALL_BAND",
                "sidewall_band must satisfy 0 <= lo < hi <= 1.",
                field="sidewall_band",
            )
        if params.curvature_frac <= 0 or params.curvature_frac > 1:
            raise DomainError(
                "INVALID_CURVATURE_FRAC",
                "curvature_frac must be in (0, 1].",
                field="curvature_frac",
            )

    def run(self, image_id: int, params: FeatureParams) -> FeatureExtractionRun:
        self._validate(params)
        with self._session_factory() as session:
            image = self._load_image(session, image_id)
            result = SegmentationResultRepository(session).find_by_image(image_id)
            if result is None:
                raise DomainError(
                    "SEGMENTATION_NOT_FOUND",
                    "Run segmentation before extracting features.",
                )
            labels_path = result.labels_path
            calibration = image.calibration_nm_per_pixel
            pixel_width = image.pixel_width
            pixel_height = image.pixel_height

        labels = np.asarray(self._derived_store.load_array(labels_path), dtype=np.uint8)
        extraction = extract_features(
            labels,
            target_class=params.target_class,
            min_area=params.min_area,
            curvature_frac=params.curvature_frac,
            sidewall_band=params.sidewall_band,
            max_radius_factor=params.max_radius_factor,
        )
        if extraction is None:
            raise DomainError(
                "NO_FEATURE_REGION",
                "No region of the target class is large enough to measure.",
                field="target_class",
            )

        prepared, runtime_skips = self._compute(
            extraction, calibration, pixel_width, pixel_height
        )

        with self._session_factory() as session:
            repository = MeasurementRepository(session)
            repository.delete_auto_by_image(image_id)
            created: list[Measurement] = [
                repository.create(
                    image_id=image_id,
                    item_id=None,
                    measurement_type=primitive.measurement_type,
                    points=primitive.points,
                    result=result_value,
                    calibration_nm_per_pixel=calibration,
                    label=primitive.label,
                    note=None,
                    source=MeasurementSource.AUTO,
                    confidence=round(primitive.confidence, 4),
                )
                for primitive, result_value in prepared
            ]
            session.commit()

        features = {
            primitive.key: round(result_value.value, 4)
            for primitive, result_value in prepared
        }
        self._segmentation.refresh_tags(image_id, features)

        skipped = tuple(
            SkippedFeatureView(key=item.key, reason=item.reason)
            for item in extraction.skipped
        ) + tuple(runtime_skips)
        LOGGER.info(
            json.dumps(
                {
                    "event": "feature_extraction_complete",
                    "image_id": image_id,
                    "target_class": params.target_class,
                    "extracted": len(created),
                    "skipped": [s.key for s in skipped],
                }
            )
        )
        return FeatureExtractionRun(
            image_id=image_id,
            target_class=extraction.target_class,
            region_area_px=extraction.region_area_px,
            region_clipped=extraction.region_clipped,
            measurements=tuple(created),
            skipped=skipped,
        )

    def _compute(
        self,
        extraction: FeatureExtraction,
        calibration: float,
        pixel_width: int,
        pixel_height: int,
    ) -> tuple[
        list[tuple[FeaturePrimitive, MeasurementResult]], list[SkippedFeatureView]
    ]:
        prepared: list[tuple[FeaturePrimitive, MeasurementResult]] = []
        runtime_skips: list[SkippedFeatureView] = []
        for primitive in extraction.primitives:
            try:
                value = calculate_measurement(
                    primitive.measurement_type,
                    primitive.points,
                    calibration,
                    pixel_width=pixel_width,
                    pixel_height=pixel_height,
                )
            except DomainError as error:
                runtime_skips.append(
                    SkippedFeatureView(key=primitive.key, reason=error.code)
                )
                continue
            prepared.append((primitive, value))
        return prepared, runtime_skips

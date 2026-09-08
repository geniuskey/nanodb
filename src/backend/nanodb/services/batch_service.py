"""Batch segmentation (and optional feature extraction) over many images.

The batch is a thin orchestration over the per-image services: it processes
each image independently and never lets one image's failure abort the rest.
Every image yields one result row -- ``ok`` with the timings/feature count, or
``error`` carrying the domain error code and message -- so a caller sees exactly
which images succeeded. Originals are never touched; all work goes through the
same services used by the single-image endpoints.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from nanodb.domain.errors import DomainError
from nanodb.services.feature_service import FeatureExtractionService, FeatureParams
from nanodb.services.segmentation_service import (
    SegmentationParams,
    SegmentationService,
)

LOGGER = logging.getLogger("nanodb.batch")


@dataclass(frozen=True, slots=True)
class BatchItemResult:
    image_id: int
    status: str  # "ok" | "error"
    replaced: bool = False
    feature_count: int | None = None
    skipped_count: int | None = None
    code: str | None = None
    message: str | None = None


@dataclass(frozen=True, slots=True)
class BatchOutcome:
    requested: int
    succeeded: int
    failed: int
    items: tuple[BatchItemResult, ...]


class SegmentationBatchService:
    def __init__(
        self,
        segmentation_service: SegmentationService,
        feature_service: FeatureExtractionService,
    ) -> None:
        self._segmentation = segmentation_service
        self._features = feature_service

    def run(
        self,
        image_ids: list[int],
        segmentation_params: SegmentationParams,
        *,
        extract_features: bool,
        feature_params: FeatureParams,
    ) -> BatchOutcome:
        # Preserve request order but process each image at most once.
        ordered_unique: list[int] = []
        seen: set[int] = set()
        for image_id in image_ids:
            if image_id not in seen:
                seen.add(image_id)
                ordered_unique.append(image_id)

        items: list[BatchItemResult] = []
        for image_id in ordered_unique:
            items.append(
                self._process_one(
                    image_id,
                    segmentation_params,
                    extract_features=extract_features,
                    feature_params=feature_params,
                )
            )

        succeeded = sum(1 for item in items if item.status == "ok")
        LOGGER.info(
            "batch_segmentation_complete requested=%d succeeded=%d failed=%d",
            len(ordered_unique),
            succeeded,
            len(ordered_unique) - succeeded,
        )
        return BatchOutcome(
            requested=len(ordered_unique),
            succeeded=succeeded,
            failed=len(ordered_unique) - succeeded,
            items=tuple(items),
        )

    def _process_one(
        self,
        image_id: int,
        segmentation_params: SegmentationParams,
        *,
        extract_features: bool,
        feature_params: FeatureParams,
    ) -> BatchItemResult:
        try:
            run = self._segmentation.run(image_id, segmentation_params)
        except DomainError as error:
            return BatchItemResult(
                image_id=image_id,
                status="error",
                code=error.code,
                message=error.message,
            )

        if not extract_features:
            return BatchItemResult(
                image_id=image_id,
                status="ok",
                replaced=run.replaced,
            )

        try:
            extraction = self._features.run(image_id, feature_params)
        except DomainError as error:
            # Segmentation succeeded; feature extraction did not. The image is
            # reported ok (its segmentation stands) with the feature failure noted.
            return BatchItemResult(
                image_id=image_id,
                status="ok",
                replaced=run.replaced,
                feature_count=0,
                code=error.code,
                message=error.message,
            )

        return BatchItemResult(
            image_id=image_id,
            status="ok",
            replaced=run.replaced,
            feature_count=len(extraction.measurements),
            skipped_count=len(extraction.skipped),
        )

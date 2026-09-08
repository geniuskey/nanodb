"""Unit tests for the batch orchestration.

The batch runs each image independently: one image's failure must not abort the
rest, duplicates collapse to a single run, and a feature-extraction failure
leaves the image reported ``ok`` (its segmentation stands) with the failure
noted. Fakes stand in for the per-image services so no DB or files are needed.
"""

from __future__ import annotations

from dataclasses import dataclass

from nanodb.domain.errors import DomainError
from nanodb.services.batch_service import SegmentationBatchService
from nanodb.services.feature_service import FeatureParams
from nanodb.services.segmentation_service import SegmentationParams


@dataclass
class _Run:
    replaced: bool


@dataclass
class _Extraction:
    measurements: tuple[int, ...]
    skipped: tuple[int, ...]


class FakeSegmentation:
    def __init__(self, missing: set[int]) -> None:
        self.missing = missing
        self.calls: list[int] = []

    def run(self, image_id: int, params: SegmentationParams) -> _Run:
        self.calls.append(image_id)
        if image_id in self.missing:
            raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
        return _Run(replaced=False)


class FakeFeatures:
    def __init__(self, no_region: set[int]) -> None:
        self.no_region = no_region
        self.calls: list[int] = []

    def run(self, image_id: int, params: FeatureParams) -> _Extraction:
        self.calls.append(image_id)
        if image_id in self.no_region:
            raise DomainError("NO_FEATURE_REGION", "No measurable region.")
        return _Extraction(measurements=(1, 2, 3), skipped=(9,))


def _service(missing: set[int], no_region: set[int]) -> SegmentationBatchService:
    return SegmentationBatchService(
        FakeSegmentation(missing),  # type: ignore[arg-type]
        FakeFeatures(no_region),  # type: ignore[arg-type]
    )


def test_each_image_yields_one_result_and_failures_do_not_abort() -> None:
    service = _service(missing={2}, no_region=set())

    outcome = service.run(
        [1, 2, 3],
        SegmentationParams(),
        extract_features=False,
        feature_params=FeatureParams(),
    )

    assert outcome.requested == 3
    assert outcome.succeeded == 2
    assert outcome.failed == 1
    by_id = {item.image_id: item for item in outcome.items}
    assert by_id[1].status == "ok"
    assert by_id[2].status == "error"
    assert by_id[2].code == "IMAGE_NOT_FOUND"
    assert by_id[3].status == "ok"


def test_duplicate_ids_run_once_and_preserve_order() -> None:
    fake_seg = FakeSegmentation(missing=set())
    service = SegmentationBatchService(fake_seg, FakeFeatures(no_region=set()))  # type: ignore[arg-type]

    outcome = service.run(
        [3, 1, 3, 1],
        SegmentationParams(),
        extract_features=False,
        feature_params=FeatureParams(),
    )

    assert fake_seg.calls == [3, 1]
    assert [item.image_id for item in outcome.items] == [3, 1]
    assert outcome.requested == 2


def test_feature_extraction_runs_when_requested() -> None:
    service = _service(missing=set(), no_region=set())

    outcome = service.run(
        [1],
        SegmentationParams(),
        extract_features=True,
        feature_params=FeatureParams(target_class=0),
    )

    item = outcome.items[0]
    assert item.status == "ok"
    assert item.feature_count == 3
    assert item.skipped_count == 1


def test_feature_failure_keeps_image_ok_with_note() -> None:
    service = _service(missing=set(), no_region={1})

    outcome = service.run(
        [1],
        SegmentationParams(),
        extract_features=True,
        feature_params=FeatureParams(),
    )

    item = outcome.items[0]
    # Segmentation succeeded, so the image is ok; the feature failure is recorded.
    assert item.status == "ok"
    assert item.feature_count == 0
    assert item.code == "NO_FEATURE_REGION"


def test_segmentation_failure_skips_feature_extraction() -> None:
    fake_features = FakeFeatures(no_region=set())
    service = SegmentationBatchService(
        FakeSegmentation(missing={5}),  # type: ignore[arg-type]
        fake_features,
    )

    service.run(
        [5],
        SegmentationParams(),
        extract_features=True,
        feature_params=FeatureParams(),
    )

    assert fake_features.calls == []

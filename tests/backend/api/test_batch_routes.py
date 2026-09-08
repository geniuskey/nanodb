"""Route tests for the batch segmentation endpoint (fake service, no DB)."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from nanodb.api.errors import install_error_handlers
from nanodb.api.middleware import install_request_middleware
from nanodb.api.routes import router
from nanodb.services.batch_service import BatchItemResult, BatchOutcome
from nanodb.services.feature_service import FeatureParams
from nanodb.services.segmentation_service import SegmentationParams


class FakeBatchService:
    def __init__(self) -> None:
        self.calls: list[tuple[list[int], SegmentationParams, bool, FeatureParams]] = []

    def run(
        self,
        image_ids: list[int],
        segmentation_params: SegmentationParams,
        *,
        extract_features: bool,
        feature_params: FeatureParams,
    ) -> BatchOutcome:
        self.calls.append(
            (image_ids, segmentation_params, extract_features, feature_params)
        )
        items = tuple(
            BatchItemResult(
                image_id=image_id,
                status="ok" if image_id != 2 else "error",
                replaced=False,
                feature_count=3 if extract_features and image_id != 2 else None,
                skipped_count=1 if extract_features and image_id != 2 else None,
                code=None if image_id != 2 else "IMAGE_NOT_FOUND",
                message=None if image_id != 2 else "Image was not found.",
            )
            for image_id in image_ids
        )
        succeeded = sum(1 for item in items if item.status == "ok")
        return BatchOutcome(
            requested=len(image_ids),
            succeeded=succeeded,
            failed=len(image_ids) - succeeded,
            items=items,
        )


def build_client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    install_error_handlers(app)
    install_request_middleware(app)
    app.state.batch_service = FakeBatchService()
    return TestClient(app, raise_server_exceptions=False)


def test_batch_reports_per_image_status() -> None:
    client = build_client()

    response = client.post(
        "/api/segmentation/batch", json={"image_ids": [1, 2, 3]}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["requested"] == 3
    assert body["succeeded"] == 2
    assert body["failed"] == 1
    statuses = {item["image_id"]: item["status"] for item in body["items"]}
    assert statuses == {1: "ok", 2: "error", 3: "ok"}


def test_batch_forwards_feature_flag_and_params() -> None:
    client = build_client()

    response = client.post(
        "/api/segmentation/batch",
        json={
            "image_ids": [1],
            "classes": 3,
            "extract_features": True,
            "target_class": 2,
        },
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["feature_count"] == 3
    ids, seg, extract, feat = client.app.state.batch_service.calls[0]
    assert ids == [1]
    assert seg.classes == 3
    assert extract is True
    assert feat.target_class == 2


def test_empty_image_ids_is_rejected_by_schema() -> None:
    response = build_client().post("/api/segmentation/batch", json={"image_ids": []})

    assert response.status_code == 422


def test_missing_image_ids_is_rejected_by_schema() -> None:
    response = build_client().post("/api/segmentation/batch", json={})

    assert response.status_code == 422

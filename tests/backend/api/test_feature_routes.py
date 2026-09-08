"""Route tests for the feature-extraction endpoint.

Exercised against a fake service (no DB, no image files) so the tests cover
request mapping, the response shape, and the error envelopes for a missing
segmentation and an unmeasurable region.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient
from nanodb.api.errors import install_error_handlers
from nanodb.api.middleware import install_request_middleware
from nanodb.api.routes import router
from nanodb.domain.entities import (
    Measurement,
    MeasurementSource,
    MeasurementType,
    Point,
)
from nanodb.domain.errors import DomainError
from nanodb.services.feature_service import (
    FeatureExtractionRun,
    FeatureParams,
    SkippedFeatureView,
)

NOW = datetime(2026, 9, 9, tzinfo=UTC)


def _auto_measurement() -> Measurement:
    return Measurement(
        id=7,
        image_id=1,
        item_id=None,
        measurement_type=MeasurementType.LENGTH,
        points=(Point(10.0, 20.0), Point(60.0, 20.0)),
        value=25.0,
        unit="nm",
        calibration_nm_per_pixel=0.5,
        label="auto: 폭(CD)",
        note=None,
        source=MeasurementSource.AUTO,
        confidence=0.83,
        created_at=NOW,
    )


class FakeFeatureService:
    def __init__(self) -> None:
        self.calls: list[tuple[int, FeatureParams]] = []

    def run(self, image_id: int, params: FeatureParams) -> FeatureExtractionRun:
        self.calls.append((image_id, params))
        if image_id == 404:
            raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
        if image_id == 405:
            raise DomainError(
                "SEGMENTATION_NOT_FOUND",
                "Run segmentation before extracting features.",
            )
        if image_id == 422:
            raise DomainError(
                "NO_FEATURE_REGION",
                "No region of the target class is large enough to measure.",
                field="target_class",
            )
        return FeatureExtractionRun(
            image_id=image_id,
            target_class=params.target_class,
            region_area_px=1234,
            region_clipped=False,
            measurements=(_auto_measurement(),),
            skipped=(SkippedFeatureView(key="bottom_curvature", reason="flat"),),
        )


def build_client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    install_error_handlers(app)
    install_request_middleware(app)
    app.state.feature_service = FakeFeatureService()
    return TestClient(app, raise_server_exceptions=False)


def test_run_uses_defaults_when_body_is_omitted() -> None:
    client = build_client()

    response = client.post("/api/images/1/features")

    assert response.status_code == 200
    body = response.json()
    assert body["target_class"] == 0
    assert body["region_area_px"] == 1234
    assert body["measurements"][0]["source"] == "auto"
    assert body["measurements"][0]["confidence"] == 0.83
    assert body["skipped"][0] == {"key": "bottom_curvature", "reason": "flat"}
    _image_id, params = client.app.state.feature_service.calls[0]
    assert params.target_class == 0
    assert params.sidewall_band == (0.2, 0.8)


def test_run_forwards_overrides() -> None:
    client = build_client()

    response = client.post(
        "/api/images/1/features",
        json={
            "target_class": 2,
            "min_area": 500,
            "curvature_frac": 0.5,
            "sidewall_band": [0.1, 0.9],
            "max_radius_factor": 4.0,
        },
    )

    assert response.status_code == 200
    _image_id, params = client.app.state.feature_service.calls[0]
    assert params.target_class == 2
    assert params.min_area == 500
    assert params.curvature_frac == 0.5
    assert params.sidewall_band == (0.1, 0.9)
    assert params.max_radius_factor == 4.0


def test_missing_image_uses_not_found_envelope() -> None:
    response = build_client().post("/api/images/404/features")

    assert response.status_code == 404
    assert response.json()["code"] == "IMAGE_NOT_FOUND"


def test_missing_segmentation_reports_not_found() -> None:
    response = build_client().post("/api/images/405/features")

    assert response.status_code == 404
    assert response.json()["code"] == "SEGMENTATION_NOT_FOUND"


def test_unmeasurable_region_returns_422() -> None:
    response = build_client().post("/api/images/422/features")

    assert response.status_code == 422
    assert response.json()["code"] == "NO_FEATURE_REGION"


def test_out_of_range_target_class_is_rejected_by_schema() -> None:
    response = build_client().post(
        "/api/images/1/features", json={"target_class": 9}
    )

    assert response.status_code == 422


def test_bad_sidewall_band_length_is_rejected_by_schema() -> None:
    response = build_client().post(
        "/api/images/1/features", json={"sidewall_band": [0.5]}
    )

    assert response.status_code == 422

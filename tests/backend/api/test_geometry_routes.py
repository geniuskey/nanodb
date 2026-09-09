"""Route tests for correcting a saved measurement's geometry.

Exercised against a fake service (no DB) so the tests cover request mapping,
the response shape and the error envelopes. Whether the correction itself is
right -- recomputed value, preserved original -- is covered by the service and
integration tests.
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

NOW = datetime(2026, 9, 9, tzinfo=UTC)


def _measurement(*, adjusted: bool, points: tuple[Point, ...]) -> Measurement:
    return Measurement(
        id=7,
        image_id=1,
        item_id=None,
        measurement_type=MeasurementType.LENGTH,
        points=points,
        value=25.0,
        unit="nm",
        calibration_nm_per_pixel=0.5,
        label="auto: 폭(CD)",
        note=None,
        source=MeasurementSource.AUTO,
        confidence=0.83,
        original_points=(Point(10.0, 20.0), Point(60.0, 20.0)) if adjusted else None,
        original_value=25.0 if adjusted else None,
        adjusted_at=NOW if adjusted else None,
        created_at=NOW,
    )


class FakeMeasurementService:
    def __init__(self) -> None:
        self.geometry_calls: list[tuple[int, int, tuple[Point, ...]]] = []
        self.revert_calls: list[tuple[int, int]] = []

    def update_geometry(
        self,
        image_id: int,
        measurement_id: int,
        *,
        points: tuple[Point, ...],
    ) -> Measurement:
        self.geometry_calls.append((image_id, measurement_id, points))
        if measurement_id == 404:
            raise DomainError("MEASUREMENT_NOT_FOUND", "Measurement was not found.")
        if measurement_id == 422:
            raise DomainError(
                "INVALID_POINT_COUNT",
                "length needs exactly 2 points.",
                field="points",
            )
        return _measurement(adjusted=True, points=points)

    def revert_geometry(self, image_id: int, measurement_id: int) -> Measurement:
        self.revert_calls.append((image_id, measurement_id))
        if measurement_id == 409:
            raise DomainError(
                "MEASUREMENT_NOT_ADJUSTED",
                "This measurement still reads as first produced.",
                status=409,
            )
        return _measurement(
            adjusted=False, points=(Point(10.0, 20.0), Point(60.0, 20.0))
        )


def build_client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    install_error_handlers(app)
    install_request_middleware(app)
    app.state.measurement_service = FakeMeasurementService()
    return TestClient(app, raise_server_exceptions=False)


def test_patch_forwards_the_moved_points_and_returns_the_trail() -> None:
    client = build_client()

    response = client.patch(
        "/api/images/1/measurements/7/geometry",
        json={"points": [{"x": 12.5, "y": 20.0}, {"x": 58.0, "y": 21.5}]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["points"] == [{"x": 12.5, "y": 20.0}, {"x": 58.0, "y": 21.5}]
    # The original reading travels with the corrected one, so a client can show
    # what the extractor said next to what the operator settled on.
    assert body["original_points"] == [{"x": 10.0, "y": 20.0}, {"x": 60.0, "y": 20.0}]
    assert body["original_value"] == 25.0
    assert body["adjusted_at"] is not None
    _image_id, _measurement_id, points = (
        client.app.state.measurement_service.geometry_calls[0]
    )
    assert points == (Point(12.5, 20.0), Point(58.0, 21.5))


def test_patch_scopes_the_measurement_to_its_image() -> None:
    client = build_client()

    response = client.patch(
        "/api/images/1/measurements/404/geometry",
        json={"points": [{"x": 1.0, "y": 1.0}, {"x": 2.0, "y": 2.0}]},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "MEASUREMENT_NOT_FOUND"


def test_patch_reports_a_point_count_that_does_not_match_the_type() -> None:
    client = build_client()

    response = client.patch(
        "/api/images/1/measurements/422/geometry",
        json={"points": [{"x": 1.0, "y": 1.0}, {"x": 2.0, "y": 2.0}]},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "INVALID_POINT_COUNT"
    assert body["detail"]["field"] == "points"


def test_patch_rejects_a_body_that_carries_no_usable_points() -> None:
    client = build_client()

    response = client.patch(
        "/api/images/1/measurements/7/geometry",
        json={"points": [{"x": 1.0, "y": 1.0}]},
    )

    assert response.status_code == 422
    assert client.app.state.measurement_service.geometry_calls == []


def test_reset_clears_the_trail() -> None:
    client = build_client()

    response = client.post("/api/images/1/measurements/7/geometry/reset")

    assert response.status_code == 200
    body = response.json()
    assert body["adjusted_at"] is None
    assert body["original_points"] is None
    assert body["original_value"] is None
    assert client.app.state.measurement_service.revert_calls == [(1, 7)]


def test_reset_of_an_uncorrected_measurement_is_a_conflict() -> None:
    client = build_client()

    response = client.post("/api/images/1/measurements/409/geometry/reset")

    assert response.status_code == 409
    assert response.json()["code"] == "MEASUREMENT_NOT_ADJUSTED"

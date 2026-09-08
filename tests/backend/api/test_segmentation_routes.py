"""Route tests for the segmentation endpoints.

The routes are exercised against a fake service (no DB, no image files) so the
tests cover request mapping, the ``replaced`` flag, variant serving and the
error envelopes for missing/invalid resources.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from nanodb.api.errors import install_error_handlers
from nanodb.api.middleware import install_request_middleware
from nanodb.api.routes import router
from nanodb.domain.entities import SegmentationClassStat, SegmentationResult
from nanodb.domain.errors import DomainError
from nanodb.services.segmentation_service import SegmentationParams, SegmentationRun

NOW = datetime(2026, 9, 9, tzinfo=UTC)


def _result(image_id: int, *, tagged: str | None) -> SegmentationResult:
    return SegmentationResult(
        id=1,
        image_id=image_id,
        method="multi-otsu",
        classes=4,
        denoise_weight=0.08,
        min_size=400,
        thresholds=(0.2, 0.5, 0.8),
        class_stats=(
            SegmentationClassStat(
                class_index=0,
                intensity_range=(0.0, 0.2),
                pixels=100,
                area_fraction=0.25,
                mean_intensity=0.1,
                area_nm2=4.0,
            ),
        ),
        map_path="derived/1/segmentation_map.png",
        boundary_path="derived/1/boundary_overlay.png",
        labels_path="derived/1/labels.npy",
        tagged_path=tagged,
        duration_ms=42,
        downscaled=False,
        created_at=NOW,
    )


class FakeSegmentationService:
    def __init__(self, tmp_path: Path) -> None:
        self.tmp_path = tmp_path
        self.run_calls: list[tuple[int, SegmentationParams]] = []
        self.existing = False

    def run(self, image_id: int, params: SegmentationParams) -> SegmentationRun:
        self.run_calls.append((image_id, params))
        if image_id != 1:
            raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
        replaced = self.existing
        self.existing = True
        return SegmentationRun(
            result=_result(image_id, tagged=None), replaced=replaced
        )

    def get(self, image_id: int) -> SegmentationResult:
        if image_id != 1:
            raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
        if not self.existing:
            raise DomainError(
                "SEGMENTATION_NOT_FOUND", "No segmentation exists for this image."
            )
        return _result(image_id, tagged=None)

    def variant_path(self, image_id: int, variant: str) -> Path:
        if variant not in {"map", "boundary"}:
            raise DomainError(
                "INVALID_SEGMENTATION_VARIANT",
                "Variant must be 'map' or 'boundary'.",
                field="variant",
                status=400,
            )
        path = self.tmp_path / f"{variant}.png"
        path.write_bytes(b"\x89PNG\r\n\x1a\n")
        return path

    def tagged_path(self, image_id: int) -> Path:
        if image_id == 2:
            raise DomainError(
                "IMAGE_NOT_TIFF",
                "A tagged copy is only available for TIFF originals.",
                status=409,
            )
        path = self.tmp_path / "tagged.tif"
        path.write_bytes(b"II*\x00")
        return path


def build_client(tmp_path: Path) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    install_error_handlers(app)
    install_request_middleware(app)
    app.state.segmentation_service = FakeSegmentationService(tmp_path)
    return TestClient(app, raise_server_exceptions=False)


def test_run_uses_defaults_when_body_is_omitted(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    response = client.post("/api/images/1/segmentation")

    assert response.status_code == 200
    body = response.json()
    assert body["method"] == "multi-otsu"
    assert body["classes"] == 4
    assert body["replaced"] is False
    assert body["map_url"] == "/api/images/1/segmentation/map"
    assert body["has_tagged_tiff"] is False
    _image_id, params = client.app.state.segmentation_service.run_calls[0]
    assert (params.classes, params.denoise_weight, params.min_size) == (4, 0.08, 400)


def test_run_forwards_overrides(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    response = client.post(
        "/api/images/1/segmentation",
        json={"classes": 3, "denoise_weight": 0.05, "min_size": 100},
    )

    assert response.status_code == 200
    _image_id, params = client.app.state.segmentation_service.run_calls[0]
    assert (params.classes, params.denoise_weight, params.min_size) == (3, 0.05, 100)


def test_second_run_reports_replaced(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    client.post("/api/images/1/segmentation")
    second = client.post("/api/images/1/segmentation")

    assert second.json()["replaced"] is True


def test_run_rejects_out_of_range_class_count(tmp_path: Path) -> None:
    response = build_client(tmp_path).post(
        "/api/images/1/segmentation", json={"classes": 9}
    )

    assert response.status_code == 422


def test_run_rejects_non_positive_denoise_weight(tmp_path: Path) -> None:
    response = build_client(tmp_path).post(
        "/api/images/1/segmentation", json={"denoise_weight": 0}
    )

    assert response.status_code == 422


def test_run_on_missing_image_uses_not_found_envelope(tmp_path: Path) -> None:
    response = build_client(tmp_path).post("/api/images/999/segmentation")

    assert response.status_code == 404
    assert response.json()["code"] == "IMAGE_NOT_FOUND"


def test_get_before_any_run_reports_not_found(tmp_path: Path) -> None:
    response = build_client(tmp_path).get("/api/images/1/segmentation")

    assert response.status_code == 404
    assert response.json()["code"] == "SEGMENTATION_NOT_FOUND"


def test_get_after_run_returns_the_result(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    client.post("/api/images/1/segmentation")

    response = client.get("/api/images/1/segmentation")

    assert response.status_code == 200
    assert response.json()["class_stats"][0]["pixels"] == 100


def test_map_variant_is_served_as_a_file(tmp_path: Path) -> None:
    response = build_client(tmp_path).get("/api/images/1/segmentation/map")

    assert response.status_code == 200
    assert response.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_invalid_variant_returns_400(tmp_path: Path) -> None:
    response = build_client(tmp_path).get("/api/images/1/segmentation/histogram")

    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_SEGMENTATION_VARIANT"


def test_tagged_copy_is_served_for_a_tiff(tmp_path: Path) -> None:
    response = build_client(tmp_path).get("/api/images/1/tagged")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/tiff"


def test_tagged_copy_conflicts_for_a_non_tiff(tmp_path: Path) -> None:
    response = build_client(tmp_path).get("/api/images/2/tagged")

    assert response.status_code == 409
    assert response.json()["code"] == "IMAGE_NOT_TIFF"

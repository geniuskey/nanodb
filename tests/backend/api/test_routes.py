from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from nanodb.api.errors import install_error_handlers
from nanodb.api.middleware import install_request_middleware
from nanodb.api.routes import router
from nanodb.domain.calculations import calculate_measurement
from nanodb.domain.entities import (
    Image,
    ImageType,
    Measurement,
    ParameterType,
    Point,
)
from nanodb.domain.errors import DomainError
from nanodb.persistence.repositories import ImageListItem
from nanodb.services.summary_service import Summary

NOW = datetime(2026, 9, 8, tzinfo=UTC)


def sample_image() -> Image:
    return Image(
        id=1,
        original_filename="sample.png",
        stored_filename="private-key.png",
        image_type=ImageType.TEM,
        product_id="P1",
        lot_id="L1",
        wafer_id="W1",
        process_step="Gate Etch",
        calibration_nm_per_pixel=0.2,
        pixel_width=1000,
        pixel_height=800,
        created_at=NOW,
    )


class FakeImageService:
    def __init__(self) -> None:
        self.registration = None
        self.list_calls: list[tuple[str | None, ImageType | None]] = []
        self.delete_calls: list[int] = []

    def register(self, stream: BytesIO, registration: object) -> Image:
        assert stream.read(1) == b"x"
        self.registration = registration
        return sample_image()

    def list_images(
        self,
        *,
        query: str | None = None,
        image_type: ImageType | None = None,
    ) -> tuple[ImageListItem, ...]:
        self.list_calls.append((query, image_type))
        return (ImageListItem(sample_image(), 0),)

    def get_image(self, image_id: int) -> Image:
        if image_id != 1:
            raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
        return sample_image()

    def delete(self, image_id: int) -> None:
        self.delete_calls.append(image_id)
        if image_id != 1:
            raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")


class FakeMeasurementService:
    def __init__(self) -> None:
        self.delete_calls: list[tuple[int, int]] = []
        self.annotation_calls: list[tuple[int, int, str | None, str | None]] = []

    def create(self, image_id: int, value: object) -> Measurement:
        start = value.start
        end = value.end
        calculation = calculate_measurement(
            start,
            end,
            0.2,
            pixel_width=1000,
            pixel_height=800,
        )
        return Measurement(
            id=1,
            image_id=image_id,
            parameter_type=value.parameter_type,
            start=start,
            end=end,
            distance_px=calculation.distance_px,
            calibration_nm_per_pixel=0.2,
            value_nm=calculation.value_nm,
            label=value.label,
            note=value.note,
            created_at=NOW,
        )

    def list_for_image(self, image_id: int) -> tuple[object, ...]:
        if image_id != 1:
            raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
        return ()

    def update_annotation(
        self,
        image_id: int,
        measurement_id: int,
        *,
        label: str | None,
        note: str | None,
    ) -> Measurement:
        self.annotation_calls.append((image_id, measurement_id, label, note))
        if measurement_id != 1:
            raise DomainError("MEASUREMENT_NOT_FOUND", "Measurement was not found.")
        return Measurement(
            id=measurement_id,
            image_id=image_id,
            parameter_type=ParameterType.CD,
            start=Point(100, 100),
            end=Point(400, 500),
            distance_px=500,
            calibration_nm_per_pixel=0.2,
            value_nm=100,
            label=label,
            note=note,
            created_at=NOW,
        )

    def delete(self, image_id: int, measurement_id: int) -> None:
        self.delete_calls.append((image_id, measurement_id))
        if image_id != 1:
            raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
        if measurement_id != 1:
            raise DomainError("MEASUREMENT_NOT_FOUND", "Measurement was not found.")


def build_client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    install_error_handlers(app)
    install_request_middleware(app)
    app.state.image_service = FakeImageService()
    app.state.measurement_service = FakeMeasurementService()
    app.state.summary_service = SimpleNamespace(
        get=lambda: Summary(1, 0, NOW),
    )
    app.state.context_export_service = SimpleNamespace(build=lambda _id: b"PKzip")
    return TestClient(app, raise_server_exceptions=False)


def test_summary_and_catalog_do_not_expose_stored_filename() -> None:
    client = build_client()

    summary = client.get("/api/summary")
    catalog = client.get("/api/images")

    assert summary.json()["image_count"] == 1
    assert catalog.json()[0]["measurement_count"] == 0
    assert "stored_filename" not in catalog.text
    assert summary.headers["x-correlation-id"]


def test_catalog_forwards_search_and_type_filters_to_service() -> None:
    client = build_client()

    response = client.get("/api/images", params={"q": "lot42", "image_type": "SEM"})

    assert response.status_code == 200
    assert client.app.state.image_service.list_calls == [("lot42", ImageType.SEM)]


def test_catalog_without_filters_forwards_none() -> None:
    client = build_client()

    client.get("/api/images")

    assert client.app.state.image_service.list_calls == [(None, None)]


def test_multipart_registration_returns_safe_image_view() -> None:
    client = build_client()

    response = client.post(
        "/api/images",
        files={"file": ("sample.png", b"xdata", "image/png")},
        data={
            "image_type": "TEM",
            "product_id": "P1",
            "lot_id": "L1",
            "wafer_id": "W1",
            "process_step": "Gate Etch",
            "calibration_nm_per_pixel": "0.2",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["file_url"] == "/api/images/1/file"
    assert body["process_step"] == "Gate Etch"
    assert "private-key.png" not in response.text
    assert client.app.state.image_service.registration.process_step == "Gate Etch"


def test_registration_without_a_process_step_is_accepted() -> None:
    client = build_client()

    response = client.post(
        "/api/images",
        files={"file": ("sample.png", b"xdata", "image/png")},
        data={
            "image_type": "TEM",
            "product_id": "P1",
            "lot_id": "L1",
            "wafer_id": "W1",
            "calibration_nm_per_pixel": "0.2",
        },
    )

    assert response.status_code == 201
    assert client.app.state.image_service.registration.process_step is None


def test_not_found_uses_safe_error_envelope() -> None:
    response = build_client().get("/api/images/999")

    assert response.status_code == 404
    assert response.json() == {
        "code": "IMAGE_NOT_FOUND",
        "message": "Image was not found.",
        "detail": None,
    }


def test_context_export_only_downloads_success_as_zip() -> None:
    response = build_client().get("/api/images/1/context-export")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert response.content == b"PKzip"


def test_measurement_request_maps_original_points_and_server_result() -> None:
    response = build_client().post(
        "/api/images/1/measurements",
        json={
            "parameter_type": ParameterType.CD,
            "start": {"x": 100, "y": 100},
            "end": {"x": 400, "y": 500},
            "label": "Gate CD",
            "note": "manual reference",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["distance_px"] == 500
    assert body["value_nm"] == 100
    assert body["label"] == "Gate CD"


def test_delete_image_returns_no_content_and_forwards_id() -> None:
    client = build_client()

    response = client.delete("/api/images/1")

    assert response.status_code == 204
    assert response.content == b""
    assert client.app.state.image_service.delete_calls == [1]


def test_delete_missing_image_uses_not_found_envelope() -> None:
    response = build_client().delete("/api/images/999")

    assert response.status_code == 404
    assert response.json()["code"] == "IMAGE_NOT_FOUND"


def test_delete_measurement_returns_no_content_and_forwards_ids() -> None:
    client = build_client()

    response = client.delete("/api/images/1/measurements/1")

    assert response.status_code == 204
    assert response.content == b""
    assert client.app.state.measurement_service.delete_calls == [(1, 1)]


def test_delete_missing_measurement_uses_not_found_envelope() -> None:
    response = build_client().delete("/api/images/1/measurements/999")

    assert response.status_code == 404
    assert response.json()["code"] == "MEASUREMENT_NOT_FOUND"


def test_invalid_non_finite_measurement_payload_is_not_accepted() -> None:
    response = build_client().post(
        "/api/images/1/measurements",
        json={
            "parameter_type": "CD",
            "start": {"x": "NaN", "y": 0},
            "end": {"x": 1, "y": 1},
        },
    )

    assert response.status_code == 422


def test_update_measurement_annotation_trims_both_fields() -> None:
    client = build_client()

    response = client.patch(
        "/api/images/1/measurements/1",
        json={"label": "  Gate CD  ", "note": "  경계 재확인  "},
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["label"], body["note"]) == ("Gate CD", "경계 재확인")
    assert client.app.state.measurement_service.annotation_calls == [
        (1, 1, "Gate CD", "경계 재확인")
    ]


def test_blank_measurement_annotation_is_stored_as_null() -> None:
    client = build_client()

    client.patch("/api/images/1/measurements/1", json={"label": " ", "note": "   "})

    assert client.app.state.measurement_service.annotation_calls == [
        (1, 1, None, None)
    ]


def test_omitted_measurement_annotation_fields_clear_the_annotation() -> None:
    client = build_client()

    # Both halves are replaced together, so an empty body means "no annotation"
    # rather than "leave whatever is stored alone".
    client.patch("/api/images/1/measurements/1", json={})

    assert client.app.state.measurement_service.annotation_calls == [
        (1, 1, None, None)
    ]


def test_update_annotation_on_missing_measurement_uses_not_found_envelope() -> None:
    response = build_client().patch(
        "/api/images/1/measurements/999",
        json={"label": None, "note": "x"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "MEASUREMENT_NOT_FOUND"


def test_export_domain_failure_is_not_returned_as_zip() -> None:
    client = build_client()
    client.app.state.context_export_service = SimpleNamespace(
        build=lambda _id: (_ for _ in ()).throw(
            DomainError("NO_MEASUREMENTS", "A saved measurement is required.")
        )
    )

    response = client.get("/api/images/1/context-export")

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["code"] == "NO_MEASUREMENTS"

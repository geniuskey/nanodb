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
    CatalogCategory,
    CatalogOption,
    Image,
    Measurement,
    MeasurementItem,
    MeasurementType,
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
        image_type="TEM",
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
        self.list_calls: list[tuple[str | None, str | None]] = []
        self.delete_calls: list[int] = []

    def register(self, stream: BytesIO, registration: object) -> Image:
        assert stream.read(1) == b"x"
        self.registration = registration
        return sample_image()

    def list_images(
        self,
        *,
        query: str | None = None,
        image_type: str | None = None,
        product_id: str | None = None,
    ) -> tuple[ImageListItem, ...]:
        self.list_calls.append((query, image_type, product_id))
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
        self.create_calls: list[tuple[int, object]] = []

    def create(self, image_id: int, value: object) -> Measurement:
        self.create_calls.append((image_id, value))
        result = calculate_measurement(
            value.measurement_type,
            value.points,
            0.2,
            pixel_width=1000,
            pixel_height=800,
        )
        return Measurement(
            id=1,
            image_id=image_id,
            item_id=value.item_id,
            measurement_type=value.measurement_type,
            points=value.points,
            value=result.value,
            unit=result.unit,
            calibration_nm_per_pixel=0.2,
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
            item_id=None,
            measurement_type=MeasurementType.LENGTH,
            points=(Point(100, 100), Point(400, 500)),
            value=100,
            unit="nm",
            calibration_nm_per_pixel=0.2,
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


class FakeMeasurementItemService:
    def __init__(self) -> None:
        self.list_calls: list[str] = []
        self.created: list[tuple[str, str, MeasurementType]] = []
        self.updated: list[tuple[int, str, MeasurementType]] = []
        self.deleted: list[int] = []

    def _item(
        self,
        item_id: int,
        product_id: str,
        name: str,
        measurement_type: MeasurementType,
    ) -> MeasurementItem:
        return MeasurementItem(
            id=item_id,
            product_id=product_id,
            name=name,
            measurement_type=measurement_type,
            created_at=NOW,
        )

    def list_for_product(self, product_id: str) -> tuple[MeasurementItem, ...]:
        self.list_calls.append(product_id)
        return (self._item(1, product_id, "Gate CD", MeasurementType.LENGTH),)

    def create(
        self, product_id: str, name: str, measurement_type: MeasurementType
    ) -> MeasurementItem:
        self.created.append((product_id, name, measurement_type))
        return self._item(9, product_id, name, measurement_type)

    def update(
        self, item_id: int, name: str, measurement_type: MeasurementType
    ) -> MeasurementItem:
        self.updated.append((item_id, name, measurement_type))
        if item_id != 9:
            raise DomainError(
                "MEASUREMENT_ITEM_NOT_FOUND", "Measurement item was not found."
            )
        return self._item(item_id, "P1", name, measurement_type)

    def delete(self, item_id: int) -> None:
        self.deleted.append(item_id)
        if item_id != 9:
            raise DomainError(
                "MEASUREMENT_ITEM_NOT_FOUND", "Measurement item was not found."
            )


class FakeCatalogService:
    def __init__(self) -> None:
        self.created: list[tuple[str, str]] = []
        self.renamed: list[tuple[int, str]] = []
        self.deleted: list[int] = []

    def list_all(self) -> tuple[CatalogOption, ...]:
        return (
            CatalogOption(
                id=1,
                category=CatalogCategory.IMAGE_TYPE,
                value="TEM",
                is_predefined=True,
                created_at=NOW,
            ),
        )

    def create(self, category: CatalogCategory, value: str) -> CatalogOption:
        self.created.append((category.value, value))
        return CatalogOption(
            id=9,
            category=category,
            value=value,
            is_predefined=False,
            created_at=NOW,
        )

    def rename(self, option_id: int, value: str) -> CatalogOption:
        self.renamed.append((option_id, value))
        if option_id == 1:
            raise DomainError(
                "PREDEFINED_OPTION", "Predefined options cannot be renamed."
            )
        if option_id == 999:
            raise DomainError("OPTION_NOT_FOUND", "Option was not found.")
        return CatalogOption(
            id=option_id,
            category=CatalogCategory.PRODUCT_ID,
            value=value,
            is_predefined=False,
            created_at=NOW,
        )

    def delete(self, option_id: int) -> None:
        self.deleted.append(option_id)
        if option_id == 1:
            raise DomainError(
                "PREDEFINED_OPTION", "Predefined options cannot be deleted."
            )
        if option_id == 999:
            raise DomainError("OPTION_NOT_FOUND", "Option was not found.")


def build_client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    install_error_handlers(app)
    install_request_middleware(app)
    app.state.image_service = FakeImageService()
    app.state.measurement_service = FakeMeasurementService()
    app.state.measurement_item_service = FakeMeasurementItemService()
    app.state.catalog_service = FakeCatalogService()
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

    response = client.get(
        "/api/images",
        params={"q": "lot42", "image_type": "SEM", "product_id": "P1"},
    )

    assert response.status_code == 200
    assert client.app.state.image_service.list_calls == [("lot42", "SEM", "P1")]


def test_catalog_without_filters_forwards_none() -> None:
    client = build_client()

    client.get("/api/images")

    assert client.app.state.image_service.list_calls == [(None, None, None)]


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


def test_length_measurement_maps_points_and_server_result() -> None:
    client = build_client()

    response = client.post(
        "/api/images/1/measurements",
        json={
            "measurement_type": "length",
            "points": [{"x": 100, "y": 100}, {"x": 400, "y": 500}],
            "label": "Gate CD",
            "note": "manual reference",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["measurement_type"] == "length"
    assert body["value"] == 100
    assert body["unit"] == "nm"
    assert body["item_id"] is None
    assert [(p["x"], p["y"]) for p in body["points"]] == [(100, 100), (400, 500)]
    assert body["label"] == "Gate CD"


def test_angle_measurement_takes_three_points_and_reports_degrees() -> None:
    client = build_client()

    response = client.post(
        "/api/images/1/measurements",
        json={
            "measurement_type": "angle",
            "points": [
                {"x": 100, "y": 100},
                {"x": 200, "y": 100},
                {"x": 100, "y": 200},
            ],
            "item_id": 5,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["measurement_type"] == "angle"
    assert body["value"] == 90
    assert body["unit"] == "deg"
    assert body["item_id"] == 5


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
            "measurement_type": "length",
            "points": [{"x": "NaN", "y": 0}, {"x": 1, "y": 1}],
        },
    )

    assert response.status_code == 422


def test_measurement_payload_rejects_a_single_point() -> None:
    response = build_client().post(
        "/api/images/1/measurements",
        json={"measurement_type": "length", "points": [{"x": 1, "y": 1}]},
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

    assert client.app.state.measurement_service.annotation_calls == [(1, 1, None, None)]


def test_omitted_measurement_annotation_fields_clear_the_annotation() -> None:
    client = build_client()

    # Both halves are replaced together, so an empty body means "no annotation"
    # rather than "leave whatever is stored alone".
    client.patch("/api/images/1/measurements/1", json={})

    assert client.app.state.measurement_service.annotation_calls == [(1, 1, None, None)]


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


def test_catalog_list_returns_options() -> None:
    response = build_client().get("/api/catalog")

    assert response.status_code == 200
    body = response.json()
    assert body == [
        {
            "id": 1,
            "category": "image_type",
            "value": "TEM",
            "is_predefined": True,
        }
    ]


def test_catalog_create_forwards_category_and_value() -> None:
    client = build_client()

    response = client.post(
        "/api/catalog",
        json={"category": "product_id", "value": "P-NEW"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["value"] == "P-NEW"
    assert body["is_predefined"] is False
    assert client.app.state.catalog_service.created == [("product_id", "P-NEW")]


def test_catalog_create_rejects_unknown_category() -> None:
    response = build_client().post(
        "/api/catalog",
        json={"category": "not_a_category", "value": "x"},
    )

    assert response.status_code == 422


def test_catalog_rename_forwards_id_and_value() -> None:
    client = build_client()

    response = client.patch("/api/catalog/9", json={"value": "P-DRAM-2"})

    assert response.status_code == 200
    assert response.json()["value"] == "P-DRAM-2"
    assert client.app.state.catalog_service.renamed == [(9, "P-DRAM-2")]


def test_catalog_rename_predefined_is_rejected() -> None:
    response = build_client().patch("/api/catalog/1", json={"value": "TEM-X"})

    assert response.status_code == 422
    assert response.json()["code"] == "PREDEFINED_OPTION"


def test_catalog_rename_missing_uses_not_found_envelope() -> None:
    response = build_client().patch("/api/catalog/999", json={"value": "x"})

    assert response.status_code == 404
    assert response.json()["code"] == "OPTION_NOT_FOUND"


def test_catalog_rename_rejects_a_blank_value() -> None:
    response = build_client().patch("/api/catalog/9", json={"value": ""})

    assert response.status_code == 422


def test_catalog_delete_returns_no_content() -> None:
    client = build_client()

    response = client.delete("/api/catalog/9")

    assert response.status_code == 204
    assert response.content == b""
    assert client.app.state.catalog_service.deleted == [9]


def test_catalog_delete_predefined_is_rejected() -> None:
    response = build_client().delete("/api/catalog/1")

    assert response.status_code == 422
    assert response.json()["code"] == "PREDEFINED_OPTION"


def test_catalog_delete_missing_uses_not_found_envelope() -> None:
    response = build_client().delete("/api/catalog/999")

    assert response.status_code == 404
    assert response.json()["code"] == "OPTION_NOT_FOUND"


def test_measurement_items_are_listed_for_a_product() -> None:
    client = build_client()

    response = client.get("/api/measurement-items", params={"product_id": "P1"})

    assert response.status_code == 200
    body = response.json()
    assert body[0]["name"] == "Gate CD"
    assert body[0]["measurement_type"] == "length"
    assert client.app.state.measurement_item_service.list_calls == ["P1"]


def test_measurement_items_require_a_product_id() -> None:
    response = build_client().get("/api/measurement-items")

    assert response.status_code == 422


def test_measurement_item_create_forwards_fields() -> None:
    client = build_client()

    response = client.post(
        "/api/measurement-items",
        json={"product_id": "P1", "name": "코너 각도", "measurement_type": "angle"},
    )

    assert response.status_code == 201
    body = response.json()
    assert (body["name"], body["measurement_type"]) == ("코너 각도", "angle")
    assert client.app.state.measurement_item_service.created == [
        ("P1", "코너 각도", MeasurementType.ANGLE)
    ]


def test_measurement_item_create_rejects_unknown_type() -> None:
    response = build_client().post(
        "/api/measurement-items",
        json={"product_id": "P1", "name": "x", "measurement_type": "volume"},
    )

    assert response.status_code == 422


def test_measurement_item_update_forwards_fields() -> None:
    client = build_client()

    response = client.patch(
        "/api/measurement-items/9",
        json={"name": "Gate CD (rev)", "measurement_type": "length"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Gate CD (rev)"
    assert client.app.state.measurement_item_service.updated == [
        (9, "Gate CD (rev)", MeasurementType.LENGTH)
    ]


def test_measurement_item_update_missing_uses_not_found_envelope() -> None:
    response = build_client().patch(
        "/api/measurement-items/123",
        json={"name": "x", "measurement_type": "length"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "MEASUREMENT_ITEM_NOT_FOUND"


def test_measurement_item_delete_returns_no_content() -> None:
    client = build_client()

    response = client.delete("/api/measurement-items/9")

    assert response.status_code == 204
    assert response.content == b""
    assert client.app.state.measurement_item_service.deleted == [9]


def test_measurement_item_delete_missing_uses_not_found_envelope() -> None:
    response = build_client().delete("/api/measurement-items/123")

    assert response.status_code == 404
    assert response.json()["code"] == "MEASUREMENT_ITEM_NOT_FOUND"

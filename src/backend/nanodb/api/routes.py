"""NANoDB internal API routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import text

from nanodb.api.mappers import catalog_option_view, image_view, measurement_view
from nanodb.api.schemas import (
    CatalogCreateSchema,
    CatalogOptionView,
    ImageDetailView,
    ImageListView,
    ImageView,
    MeasurementAnnotationSchema,
    MeasurementInputSchema,
    MeasurementView,
    ParameterSummaryView,
    ReadinessView,
    SummaryView,
)
from nanodb.domain.entities import Point
from nanodb.services.image_service import ImageRegistration
from nanodb.services.measurement_service import MeasurementInput

router = APIRouter(prefix="/api")


@router.get("/health/live")
def liveness() -> dict[str, str]:
    return {"status": "alive"}


@router.get("/health/ready", response_model=ReadinessView)
def readiness(request: Request) -> ReadinessView:
    with request.app.state.session_factory() as session:
        session.execute(text("SELECT 1"))
    request.app.state.file_store.check_read_write()
    return ReadinessView(status="ready", database="ready", upload_root="ready")


@router.get("/summary", response_model=SummaryView)
def summary(request: Request) -> SummaryView:
    value = request.app.state.summary_service.get()
    return SummaryView(
        image_count=value.image_count,
        measurement_count=value.measurement_count,
        calculated_at=value.calculated_at,
        parameters=[
            ParameterSummaryView.model_validate(entry) for entry in value.parameters
        ],
    )


@router.post("/images", response_model=ImageView, status_code=201)
def register_image(
    request: Request,
    file: Annotated[UploadFile, File()],
    image_type: Annotated[str, Form()],
    product_id: Annotated[str, Form()],
    lot_id: Annotated[str, Form()],
    wafer_id: Annotated[str, Form()],
    calibration_nm_per_pixel: Annotated[float, Form()],
    process_step: Annotated[str | None, Form()] = None,
) -> ImageView:
    image = request.app.state.image_service.register(
        file.file,
        ImageRegistration(
            original_filename=file.filename or "unnamed-image",
            image_type=image_type,
            product_id=product_id,
            lot_id=lot_id,
            wafer_id=wafer_id,
            calibration_nm_per_pixel=calibration_nm_per_pixel,
            process_step=process_step,
        ),
    )
    return image_view(image)


@router.get("/images", response_model=list[ImageListView])
def list_images(
    request: Request,
    q: Annotated[str | None, Query(max_length=200)] = None,
    image_type: Annotated[str | None, Query(max_length=64)] = None,
) -> list[ImageListView]:
    return [
        ImageListView(
            **image_view(item.image).model_dump(),
            measurement_count=item.measurement_count,
        )
        for item in request.app.state.image_service.list_images(
            query=q,
            image_type=image_type,
        )
    ]


@router.get("/images/{image_id}", response_model=ImageDetailView)
def image_detail(image_id: int, request: Request) -> ImageDetailView:
    image = request.app.state.image_service.get_image(image_id)
    measurements = request.app.state.measurement_service.list_for_image(image_id)
    return ImageDetailView(
        **image_view(image).model_dump(),
        measurements=[measurement_view(item) for item in measurements],
    )


@router.get("/images/{image_id}/file")
def image_file(image_id: int, request: Request) -> FileResponse:
    return FileResponse(request.app.state.image_service.image_path(image_id))


@router.delete("/images/{image_id}", status_code=204)
def delete_image(image_id: int, request: Request) -> Response:
    request.app.state.image_service.delete(image_id)
    return Response(status_code=204)


@router.post(
    "/images/{image_id}/measurements",
    response_model=MeasurementView,
    status_code=201,
)
def create_measurement(
    image_id: int,
    payload: MeasurementInputSchema,
    request: Request,
) -> MeasurementView:
    result = request.app.state.measurement_service.create(
        image_id,
        MeasurementInput(
            parameter_type=payload.parameter_type,
            start=Point(payload.start.x, payload.start.y),
            end=Point(payload.end.x, payload.end.y),
            label=payload.label,
            note=payload.note,
        ),
    )
    return measurement_view(result)


@router.get(
    "/images/{image_id}/measurements",
    response_model=list[MeasurementView],
)
def list_measurements(image_id: int, request: Request) -> list[MeasurementView]:
    return [
        measurement_view(item)
        for item in request.app.state.measurement_service.list_for_image(image_id)
    ]


@router.patch(
    "/images/{image_id}/measurements/{measurement_id}",
    response_model=MeasurementView,
)
def update_measurement_annotation(
    image_id: int,
    measurement_id: int,
    payload: MeasurementAnnotationSchema,
    request: Request,
) -> MeasurementView:
    label = payload.label.strip() if payload.label else None
    note = payload.note.strip() if payload.note else None
    return measurement_view(
        request.app.state.measurement_service.update_annotation(
            image_id,
            measurement_id,
            label=label or None,
            note=note or None,
        )
    )


@router.delete(
    "/images/{image_id}/measurements/{measurement_id}",
    status_code=204,
)
def delete_measurement(
    image_id: int,
    measurement_id: int,
    request: Request,
) -> Response:
    request.app.state.measurement_service.delete(image_id, measurement_id)
    return Response(status_code=204)


@router.get("/catalog", response_model=list[CatalogOptionView])
def list_catalog(request: Request) -> list[CatalogOptionView]:
    return [
        catalog_option_view(option)
        for option in request.app.state.catalog_service.list_all()
    ]


@router.post("/catalog", response_model=CatalogOptionView, status_code=201)
def create_catalog_option(
    payload: CatalogCreateSchema,
    request: Request,
) -> CatalogOptionView:
    option = request.app.state.catalog_service.create(
        payload.category,
        payload.value,
    )
    return catalog_option_view(option)


@router.delete("/catalog/{option_id}", status_code=204)
def delete_catalog_option(option_id: int, request: Request) -> Response:
    request.app.state.catalog_service.delete(option_id)
    return Response(status_code=204)


@router.get("/images/{image_id}/context-export")
def context_export(image_id: int, request: Request) -> Response:
    content = request.app.state.context_export_service.build(image_id)
    return Response(
        content=content,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="nanodb-image-{image_id}.zip"'
        },
    )

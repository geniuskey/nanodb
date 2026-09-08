"""NANoDB internal API routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import text

from nanodb.api.mappers import (
    catalog_option_view,
    feature_extraction_view,
    image_view,
    measurement_item_view,
    measurement_view,
    segmentation_batch_view,
    segmentation_result_view,
)
from nanodb.api.schemas import (
    CatalogCreateSchema,
    CatalogOptionView,
    CatalogUpdateSchema,
    FeatureExtractionRequestSchema,
    FeatureExtractionResultView,
    ImageDetailView,
    ImageListView,
    ImageView,
    MeasurementAnnotationSchema,
    MeasurementInputSchema,
    MeasurementItemCreateSchema,
    MeasurementItemUpdateSchema,
    MeasurementItemView,
    MeasurementTypeSummaryView,
    MeasurementView,
    ReadinessView,
    SegmentationBatchRequestSchema,
    SegmentationBatchResultView,
    SegmentationRequestSchema,
    SegmentationResultView,
    SummaryView,
)
from nanodb.domain.entities import Point
from nanodb.services.feature_service import FeatureParams
from nanodb.services.image_service import ImageRegistration
from nanodb.services.measurement_service import MeasurementInput
from nanodb.services.segmentation_service import SegmentationParams

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
        types=[
            MeasurementTypeSummaryView.model_validate(entry) for entry in value.types
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
            measurement_type=payload.measurement_type,
            points=tuple(Point(point.x, point.y) for point in payload.points),
            item_id=payload.item_id,
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


@router.patch("/catalog/{option_id}", response_model=CatalogOptionView)
def rename_catalog_option(
    option_id: int,
    payload: CatalogUpdateSchema,
    request: Request,
) -> CatalogOptionView:
    option = request.app.state.catalog_service.rename(option_id, payload.value)
    return catalog_option_view(option)


@router.delete("/catalog/{option_id}", status_code=204)
def delete_catalog_option(option_id: int, request: Request) -> Response:
    request.app.state.catalog_service.delete(option_id)
    return Response(status_code=204)


@router.get("/measurement-items", response_model=list[MeasurementItemView])
def list_measurement_items(
    request: Request,
    product_id: Annotated[str, Query(min_length=1, max_length=255)],
) -> list[MeasurementItemView]:
    return [
        measurement_item_view(item)
        for item in request.app.state.measurement_item_service.list_for_product(
            product_id
        )
    ]


@router.post("/measurement-items", response_model=MeasurementItemView, status_code=201)
def create_measurement_item(
    payload: MeasurementItemCreateSchema,
    request: Request,
) -> MeasurementItemView:
    item = request.app.state.measurement_item_service.create(
        payload.product_id,
        payload.name,
        payload.measurement_type,
    )
    return measurement_item_view(item)


@router.patch("/measurement-items/{item_id}", response_model=MeasurementItemView)
def update_measurement_item(
    item_id: int,
    payload: MeasurementItemUpdateSchema,
    request: Request,
) -> MeasurementItemView:
    item = request.app.state.measurement_item_service.update(
        item_id,
        payload.name,
        payload.measurement_type,
    )
    return measurement_item_view(item)


@router.delete("/measurement-items/{item_id}", status_code=204)
def delete_measurement_item(item_id: int, request: Request) -> Response:
    request.app.state.measurement_item_service.delete(item_id)
    return Response(status_code=204)


@router.post(
    "/images/{image_id}/segmentation",
    response_model=SegmentationResultView,
)
def run_segmentation(
    image_id: int,
    request: Request,
    payload: SegmentationRequestSchema | None = None,
) -> SegmentationResultView:
    options = payload or SegmentationRequestSchema()
    run = request.app.state.segmentation_service.run(
        image_id,
        SegmentationParams(
            classes=options.classes,
            denoise_weight=options.denoise_weight,
            min_size=options.min_size,
        ),
    )
    return segmentation_result_view(run.result, replaced=run.replaced)


@router.get(
    "/images/{image_id}/segmentation",
    response_model=SegmentationResultView,
)
def get_segmentation(image_id: int, request: Request) -> SegmentationResultView:
    result = request.app.state.segmentation_service.get(image_id)
    return segmentation_result_view(result)


@router.get("/images/{image_id}/segmentation/{variant}")
def segmentation_variant(
    image_id: int,
    variant: str,
    request: Request,
) -> FileResponse:
    return FileResponse(
        request.app.state.segmentation_service.variant_path(image_id, variant)
    )


@router.post(
    "/segmentation/batch",
    response_model=SegmentationBatchResultView,
)
def run_segmentation_batch(
    payload: SegmentationBatchRequestSchema,
    request: Request,
) -> SegmentationBatchResultView:
    outcome = request.app.state.batch_service.run(
        payload.image_ids,
        SegmentationParams(
            classes=payload.classes,
            denoise_weight=payload.denoise_weight,
            min_size=payload.min_size,
        ),
        extract_features=payload.extract_features,
        feature_params=FeatureParams(target_class=payload.target_class),
    )
    return segmentation_batch_view(outcome)


@router.post(
    "/images/{image_id}/features",
    response_model=FeatureExtractionResultView,
)
def extract_features(
    image_id: int,
    request: Request,
    payload: FeatureExtractionRequestSchema | None = None,
) -> FeatureExtractionResultView:
    options = payload or FeatureExtractionRequestSchema()
    run = request.app.state.feature_service.run(
        image_id,
        FeatureParams(
            target_class=options.target_class,
            min_area=options.min_area,
            curvature_frac=options.curvature_frac,
            sidewall_band=(options.sidewall_band[0], options.sidewall_band[1]),
            max_radius_factor=options.max_radius_factor,
        ),
    )
    return feature_extraction_view(run)


@router.get("/images/{image_id}/tagged")
def tagged_image(image_id: int, request: Request) -> FileResponse:
    return FileResponse(
        request.app.state.segmentation_service.tagged_path(image_id),
        media_type="image/tiff",
    )


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

"""Domain-to-transport mapping without persistence details."""

from nanodb.api.schemas import (
    BatchItemResultView,
    CatalogOptionView,
    FeatureExtractionResultView,
    ImageView,
    MeasurementItemView,
    MeasurementView,
    PointView,
    SegmentationBatchResultView,
    SegmentationClassStatView,
    SegmentationResultView,
    SkippedFeatureViewSchema,
)
from nanodb.domain.entities import (
    CatalogOption,
    Image,
    Measurement,
    MeasurementItem,
    SegmentationResult,
)
from nanodb.services.batch_service import BatchOutcome
from nanodb.services.feature_service import FeatureExtractionRun


def catalog_option_view(option: CatalogOption) -> CatalogOptionView:
    return CatalogOptionView(
        id=option.id,
        category=option.category,
        value=option.value,
        is_predefined=option.is_predefined,
    )


def image_view(image: Image) -> ImageView:
    return ImageView(
        id=image.id,
        original_filename=image.original_filename,
        image_type=image.image_type,
        product_id=image.product_id,
        lot_id=image.lot_id,
        wafer_id=image.wafer_id,
        process_step=image.process_step,
        calibration_nm_per_pixel=image.calibration_nm_per_pixel,
        pixel_width=image.pixel_width,
        pixel_height=image.pixel_height,
        created_at=image.created_at,
        file_url=f"/api/images/{image.id}/file",
    )


def measurement_view(measurement: Measurement) -> MeasurementView:
    return MeasurementView(
        id=measurement.id,
        image_id=measurement.image_id,
        item_id=measurement.item_id,
        measurement_type=measurement.measurement_type,
        points=[PointView(x=point.x, y=point.y) for point in measurement.points],
        value=measurement.value,
        unit=measurement.unit,
        calibration_nm_per_pixel=measurement.calibration_nm_per_pixel,
        label=measurement.label,
        note=measurement.note,
        measurement_method=measurement.measurement_method,
        source=measurement.source.value,
        confidence=measurement.confidence,
        reference_status=measurement.reference_status,
        created_at=measurement.created_at,
    )


def feature_extraction_view(run: FeatureExtractionRun) -> FeatureExtractionResultView:
    return FeatureExtractionResultView(
        image_id=run.image_id,
        target_class=run.target_class,
        region_area_px=run.region_area_px,
        region_clipped=run.region_clipped,
        measurements=[measurement_view(m) for m in run.measurements],
        skipped=[
            SkippedFeatureViewSchema(key=s.key, reason=s.reason) for s in run.skipped
        ],
    )


def segmentation_batch_view(outcome: BatchOutcome) -> SegmentationBatchResultView:
    return SegmentationBatchResultView(
        requested=outcome.requested,
        succeeded=outcome.succeeded,
        failed=outcome.failed,
        items=[
            BatchItemResultView(
                image_id=item.image_id,
                status=item.status,
                replaced=item.replaced,
                feature_count=item.feature_count,
                skipped_count=item.skipped_count,
                code=item.code,
                message=item.message,
            )
            for item in outcome.items
        ],
    )


def segmentation_result_view(
    result: SegmentationResult,
    *,
    replaced: bool = False,
) -> SegmentationResultView:
    return SegmentationResultView(
        image_id=result.image_id,
        method=result.method,
        classes=result.classes,
        denoise_weight=result.denoise_weight,
        min_size=result.min_size,
        thresholds=list(result.thresholds),
        class_stats=[
            SegmentationClassStatView(
                class_index=stat.class_index,
                intensity_range=list(stat.intensity_range),
                pixels=stat.pixels,
                area_fraction=stat.area_fraction,
                mean_intensity=stat.mean_intensity,
                area_nm2=stat.area_nm2,
            )
            for stat in result.class_stats
        ],
        duration_ms=result.duration_ms,
        downscaled=result.downscaled,
        has_tagged_tiff=result.tagged_path is not None,
        map_url=f"/api/images/{result.image_id}/segmentation/map",
        boundary_url=f"/api/images/{result.image_id}/segmentation/boundary",
        created_at=result.created_at,
        replaced=replaced,
    )


def measurement_item_view(item: MeasurementItem) -> MeasurementItemView:
    return MeasurementItemView(
        id=item.id,
        product_id=item.product_id,
        name=item.name,
        measurement_type=item.measurement_type,
        created_at=item.created_at,
    )

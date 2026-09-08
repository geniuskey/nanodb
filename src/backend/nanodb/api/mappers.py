"""Domain-to-transport mapping without persistence details."""

from nanodb.api.schemas import CatalogOptionView, ImageView, MeasurementView
from nanodb.domain.entities import CatalogOption, Image, Measurement


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
        parameter_type=measurement.parameter_type,
        start_x=measurement.start.x,
        start_y=measurement.start.y,
        end_x=measurement.end.x,
        end_y=measurement.end.y,
        distance_px=measurement.distance_px,
        calibration_nm_per_pixel=measurement.calibration_nm_per_pixel,
        value_nm=measurement.value_nm,
        label=measurement.label,
        note=measurement.note,
        measurement_method=measurement.measurement_method,
        reference_status=measurement.reference_status,
        created_at=measurement.created_at,
    )


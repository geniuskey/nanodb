"""Domain-to-transport mapping without persistence details."""

from nanodb.api.schemas import (
    CatalogOptionView,
    ImageView,
    MeasurementItemView,
    MeasurementView,
    PointView,
)
from nanodb.domain.entities import (
    CatalogOption,
    Image,
    Measurement,
    MeasurementItem,
)


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
        reference_status=measurement.reference_status,
        created_at=measurement.created_at,
    )


def measurement_item_view(item: MeasurementItem) -> MeasurementItemView:
    return MeasurementItemView(
        id=item.id,
        product_id=item.product_id,
        name=item.name,
        measurement_type=item.measurement_type,
        created_at=item.created_at,
    )

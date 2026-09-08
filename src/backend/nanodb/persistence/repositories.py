"""Repository adapters with deterministic NANoDB query contracts."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from nanodb.domain.calculations import MeasurementResult
from nanodb.domain.entities import (
    UNIT_BY_TYPE,
    CatalogCategory,
    CatalogOption,
    Image,
    Measurement,
    MeasurementItem,
    MeasurementType,
    MeasurementTypeStat,
    Point,
)
from nanodb.persistence.models import (
    CatalogOptionModel,
    ImageModel,
    MeasurementItemModel,
    MeasurementModel,
)


@dataclass(frozen=True, slots=True)
class ImageListItem:
    image: Image
    measurement_count: int


def _to_image(model: ImageModel) -> Image:
    return Image(
        id=model.id,
        original_filename=model.original_filename,
        stored_filename=model.stored_filename,
        display_filename=model.display_filename,
        image_type=model.image_type,
        product_id=model.product_id,
        lot_id=model.lot_id,
        wafer_id=model.wafer_id,
        process_step=model.process_step,
        calibration_nm_per_pixel=model.calibration_nm_per_pixel,
        pixel_width=model.pixel_width,
        pixel_height=model.pixel_height,
        created_at=model.created_at,
    )


def _to_measurement(model: MeasurementModel) -> Measurement:
    return Measurement(
        id=model.id,
        image_id=model.image_id,
        item_id=model.item_id,
        measurement_type=MeasurementType(model.measurement_type),
        points=tuple(Point(float(x), float(y)) for x, y in model.points),
        value=model.value,
        unit=model.unit,
        calibration_nm_per_pixel=model.calibration_nm_per_pixel,
        label=model.label,
        note=model.note,
        created_at=model.created_at,
    )


def _to_measurement_item(model: MeasurementItemModel) -> MeasurementItem:
    return MeasurementItem(
        id=model.id,
        product_id=model.product_id,
        name=model.name,
        measurement_type=MeasurementType(model.measurement_type),
        created_at=model.created_at,
    )


def _to_catalog_option(model: CatalogOptionModel) -> CatalogOption:
    return CatalogOption(
        id=model.id,
        category=CatalogCategory(model.category),
        value=model.value,
        is_predefined=model.is_predefined,
        created_at=model.created_at,
    )


class CatalogRepository:
    """Managed lookup lists for the registration comboboxes."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def list_all(self) -> tuple[CatalogOption, ...]:
        """Every option, grouped-friendly: by category, predefined first, then
        by value so each list reads in a stable order."""
        statement = select(CatalogOptionModel).order_by(
            CatalogOptionModel.category.asc(),
            CatalogOptionModel.is_predefined.desc(),
            CatalogOptionModel.value.asc(),
        )
        return tuple(
            _to_catalog_option(model) for model in self._session.scalars(statement)
        )

    def find(self, option_id: int) -> CatalogOption | None:
        model = self._session.get(CatalogOptionModel, option_id)
        return _to_catalog_option(model) if model else None

    def create(self, category: CatalogCategory, value: str) -> CatalogOption:
        model = CatalogOptionModel(
            category=category.value,
            value=value,
            is_predefined=False,
        )
        self._session.add(model)
        self._session.flush()
        self._session.refresh(model)
        return _to_catalog_option(model)

    def rename(self, option_id: int, value: str) -> CatalogOption | None:
        """Change an option's value in place. Returns ``None`` when missing."""
        model = self._session.get(CatalogOptionModel, option_id)
        if model is None:
            return None
        model.value = value
        self._session.flush()
        self._session.refresh(model)
        return _to_catalog_option(model)

    def exists(self, category: CatalogCategory, value: str) -> bool:
        statement = select(CatalogOptionModel.id).where(
            CatalogOptionModel.category == category.value,
            CatalogOptionModel.value == value,
        )
        return self._session.scalar(statement) is not None

    def delete(self, option_id: int) -> bool:
        model = self._session.get(CatalogOptionModel, option_id)
        if model is None:
            return False
        self._session.delete(model)
        return True

    def ensure_many(self, values: dict[CatalogCategory, str]) -> None:
        """Add any not-yet-seen values as custom (non-predefined) options.

        Called during registration so a value an operator types becomes part of
        the list for next time. Existing values (including predefined ones) are
        left untouched via an idempotent upsert that ignores conflicts.
        """
        rows = [
            {"category": category.value, "value": value, "is_predefined": False}
            for category, value in values.items()
            if value
        ]
        if not rows:
            return
        statement = pg_insert(CatalogOptionModel).values(rows)
        statement = statement.on_conflict_do_nothing(
            constraint="uq_catalog_options_category_value"
        )
        self._session.execute(statement)


class MeasurementItemRepository:
    """Per-product measurement definitions (name + geometry type)."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def list_by_product(self, product_id: str) -> tuple[MeasurementItem, ...]:
        statement = (
            select(MeasurementItemModel)
            .where(MeasurementItemModel.product_id == product_id)
            .order_by(
                MeasurementItemModel.name.asc(),
                MeasurementItemModel.id.asc(),
            )
        )
        return tuple(
            _to_measurement_item(model) for model in self._session.scalars(statement)
        )

    def find(self, item_id: int) -> MeasurementItem | None:
        model = self._session.get(MeasurementItemModel, item_id)
        return _to_measurement_item(model) if model else None

    def exists(self, product_id: str, name: str) -> bool:
        statement = select(MeasurementItemModel.id).where(
            MeasurementItemModel.product_id == product_id,
            MeasurementItemModel.name == name,
        )
        return self._session.scalar(statement) is not None

    def create(
        self,
        *,
        product_id: str,
        name: str,
        measurement_type: MeasurementType,
    ) -> MeasurementItem:
        model = MeasurementItemModel(
            product_id=product_id,
            name=name,
            measurement_type=measurement_type.value,
        )
        self._session.add(model)
        self._session.flush()
        self._session.refresh(model)
        return _to_measurement_item(model)

    def update(
        self,
        item_id: int,
        *,
        name: str,
        measurement_type: MeasurementType,
    ) -> MeasurementItem | None:
        model = self._session.get(MeasurementItemModel, item_id)
        if model is None:
            return None
        model.name = name
        model.measurement_type = measurement_type.value
        self._session.flush()
        self._session.refresh(model)
        return _to_measurement_item(model)

    def delete(self, item_id: int) -> bool:
        model = self._session.get(MeasurementItemModel, item_id)
        if model is None:
            return False
        self._session.delete(model)
        return True


class ImageRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        *,
        original_filename: str,
        stored_filename: str,
        image_type: str,
        product_id: str,
        lot_id: str,
        wafer_id: str,
        calibration_nm_per_pixel: float,
        pixel_width: int,
        pixel_height: int,
        display_filename: str | None = None,
        process_step: str | None = None,
    ) -> Image:
        model = ImageModel(
            original_filename=original_filename,
            stored_filename=stored_filename,
            display_filename=display_filename,
            image_type=image_type,
            product_id=product_id,
            lot_id=lot_id,
            wafer_id=wafer_id,
            process_step=process_step,
            calibration_nm_per_pixel=calibration_nm_per_pixel,
            pixel_width=pixel_width,
            pixel_height=pixel_height,
        )
        self._session.add(model)
        self._session.flush()
        self._session.refresh(model)
        return _to_image(model)

    def find(self, image_id: int) -> Image | None:
        model = self._session.get(ImageModel, image_id)
        return _to_image(model) if model else None

    def count(self) -> int:
        return self._session.scalar(select(func.count(ImageModel.id))) or 0

    def delete(self, image_id: int) -> bool:
        """Delete an image row. Callers must remove its measurements first
        because the foreign key uses RESTRICT."""
        model = self._session.get(ImageModel, image_id)
        if model is None:
            return False
        self._session.delete(model)
        return True

    def list_with_measurement_count(
        self,
        *,
        query: str | None = None,
        image_type: str | None = None,
    ) -> tuple[ImageListItem, ...]:
        """List images newest-first, optionally filtered.

        ``query`` is a case-insensitive partial match against original filename,
        product, lot, wafer and process step. ``image_type`` narrows to an exact
        imaging modality. A blank query matches everything so the catalog stays
        visible while typing.
        """
        statement: Select[tuple[ImageModel, int]] = (
            select(ImageModel, func.count(MeasurementModel.id))
            .outerjoin(MeasurementModel, MeasurementModel.image_id == ImageModel.id)
            .group_by(ImageModel.id)
            .order_by(ImageModel.created_at.desc(), ImageModel.id.desc())
        )
        if image_type is not None:
            statement = statement.where(ImageModel.image_type == image_type)
        if query and query.strip():
            pattern = f"%{query.strip()}%"
            statement = statement.where(
                or_(
                    ImageModel.original_filename.ilike(pattern),
                    ImageModel.product_id.ilike(pattern),
                    ImageModel.lot_id.ilike(pattern),
                    ImageModel.wafer_id.ilike(pattern),
                    ImageModel.process_step.ilike(pattern),
                )
            )
        return tuple(
            ImageListItem(_to_image(model), int(count))
            for model, count in self._session.execute(statement).all()
        )


class MeasurementRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        *,
        image_id: int,
        item_id: int | None,
        measurement_type: MeasurementType,
        points: tuple[Point, ...],
        result: MeasurementResult,
        calibration_nm_per_pixel: float,
        label: str | None,
        note: str | None,
    ) -> Measurement:
        model = MeasurementModel(
            image_id=image_id,
            item_id=item_id,
            measurement_type=measurement_type.value,
            points=[[point.x, point.y] for point in points],
            value=result.value,
            unit=result.unit,
            calibration_nm_per_pixel=calibration_nm_per_pixel,
            label=label,
            note=note,
        )
        self._session.add(model)
        self._session.flush()
        self._session.refresh(model)
        return _to_measurement(model)

    def count(self) -> int:
        return self._session.scalar(select(func.count(MeasurementModel.id))) or 0

    def aggregate_by_type(self) -> tuple[MeasurementTypeStat, ...]:
        """Per-type count, mean, min and max in the fixed type order.

        Only types with at least one stored measurement are returned, so an
        empty database and never-measured types both stay absent (n=0). Values
        within a type share a unit, so the statistics are comparable.
        """
        statement = select(
            MeasurementModel.measurement_type,
            func.count(MeasurementModel.id),
            func.sum(MeasurementModel.value),
            func.min(MeasurementModel.value),
            func.max(MeasurementModel.value),
        ).group_by(MeasurementModel.measurement_type)
        rows = {
            measurement_type: (int(count), float(total), float(low), float(high))
            for measurement_type, count, total, low, high in self._session.execute(
                statement
            )
        }
        return tuple(
            MeasurementTypeStat(
                measurement_type=measurement_type,
                unit=UNIT_BY_TYPE[measurement_type],
                count=rows[measurement_type.value][0],
                mean=rows[measurement_type.value][1] / rows[measurement_type.value][0],
                min=rows[measurement_type.value][2],
                max=rows[measurement_type.value][3],
            )
            for measurement_type in MeasurementType
            if rows.get(measurement_type.value, (0, 0.0, 0.0, 0.0))[0] > 0
        )

    def list_by_image(
        self,
        image_id: int,
        *,
        export_order: bool = False,
    ) -> tuple[Measurement, ...]:
        statement = select(MeasurementModel).where(
            MeasurementModel.image_id == image_id
        )
        if export_order:
            statement = statement.order_by(MeasurementModel.id.asc())
        else:
            statement = statement.order_by(
                MeasurementModel.created_at.desc(),
                MeasurementModel.id.desc(),
            )
        return tuple(
            _to_measurement(model) for model in self._session.scalars(statement)
        )

    def update_annotation(
        self,
        image_id: int,
        measurement_id: int,
        *,
        label: str | None,
        note: str | None,
    ) -> Measurement | None:
        """Replace a measurement's annotation (its label and note).

        The evidence a measurement rests on -- its points, type, value and
        calibration -- is immutable, so only the two descriptive fields are
        writable. Both are replaced together because the editor always submits
        both. Returns ``None`` when the measurement is missing or belongs to a
        different image, so callers cannot edit across images by guessing ids.
        """
        model = self._session.get(MeasurementModel, measurement_id)
        if model is None or model.image_id != image_id:
            return None
        model.label = label
        model.note = note
        self._session.flush()
        self._session.refresh(model)
        return _to_measurement(model)

    def delete(self, image_id: int, measurement_id: int) -> bool:
        """Delete a single measurement scoped to its image.

        Returns ``True`` when a matching measurement was removed. A measurement
        that belongs to a different image is treated as not found so callers
        cannot delete across images by guessing ids.
        """
        model = self._session.get(MeasurementModel, measurement_id)
        if model is None or model.image_id != image_id:
            return False
        self._session.delete(model)
        return True

    def delete_by_image(self, image_id: int) -> int:
        """Delete every measurement for an image; returns how many were removed."""
        count = 0
        statement = select(MeasurementModel).where(
            MeasurementModel.image_id == image_id
        )
        for model in self._session.scalars(statement):
            self._session.delete(model)
            count += 1
        return count

    def delete_all(self) -> None:
        for model in self._session.scalars(select(MeasurementModel)):
            self._session.delete(model)


def database_clock(session: Session) -> datetime:
    """Return the PostgreSQL transaction timestamp for summary responses."""
    value = session.scalar(select(func.now()))
    if value is None:
        raise RuntimeError("Database did not return a transaction timestamp.")
    return value

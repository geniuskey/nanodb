"""Repository adapters with deterministic NANoDB query contracts."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import cast

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
    MeasurementSource,
    MeasurementType,
    MeasurementTypeStat,
    Point,
    SegmentationClassStat,
    SegmentationResult,
)
from nanodb.persistence.models import (
    CatalogOptionModel,
    ImageModel,
    MeasurementItemModel,
    MeasurementModel,
    SegmentationResultModel,
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
        note=model.note,
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
        source=MeasurementSource(model.source),
        confidence=model.confidence,
        original_points=(
            tuple(Point(float(x), float(y)) for x, y in model.original_points)
            if model.original_points is not None
            else None
        ),
        original_value=model.original_value,
        adjusted_at=model.adjusted_at,
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
        note: str | None = None,
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
            note=note,
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
        source: MeasurementSource = MeasurementSource.MANUAL,
        confidence: float | None = None,
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
            source=source.value,
            confidence=confidence,
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

    def find(self, image_id: int, measurement_id: int) -> Measurement | None:
        """One measurement, scoped to its image.

        A measurement that belongs to a different image is reported as missing,
        so callers cannot reach across images by guessing ids.
        """
        model = self._session.get(MeasurementModel, measurement_id)
        if model is None or model.image_id != image_id:
            return None
        return _to_measurement(model)

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

    def delete_auto_by_image(self, image_id: int) -> tuple[int, int]:
        """Delete the replaceable auto measurements of an image.

        Human-drawn ('manual') measurements are never touched, so re-running the
        feature extractor replaces machine output without erasing evidence a
        person recorded. An auto measurement whose points a person has corrected
        is that same evidence: the correction is human work that the extractor
        cannot reproduce, so it is preserved too.

        Returns ``(deleted, preserved)`` so the caller can tell the operator
        that their corrections survived the re-run.
        """
        deleted = 0
        preserved = 0
        statement = select(MeasurementModel).where(
            MeasurementModel.image_id == image_id,
            MeasurementModel.source == MeasurementSource.AUTO.value,
        )
        for model in self._session.scalars(statement):
            if model.adjusted_at is not None:
                preserved += 1
                continue
            self._session.delete(model)
            deleted += 1
        return deleted, preserved

    def update_geometry(
        self,
        image_id: int,
        measurement_id: int,
        *,
        points: tuple[Point, ...],
        result: MeasurementResult,
        adjusted_at: datetime,
    ) -> Measurement | None:
        """Move a measurement's points and store the recomputed value.

        The first correction copies the current points and value into the
        ``original_*`` columns, so what the extractor (or the first hand
        placement) produced is still readable afterwards; later corrections
        leave that first record alone. Type and calibration are never writable:
        the value stays derivable from the stored points, which is what the
        export validator recomputes.

        Returns ``None`` when the measurement is missing or belongs to a
        different image, so callers cannot edit across images by guessing ids.
        """
        model = self._session.get(MeasurementModel, measurement_id)
        if model is None or model.image_id != image_id:
            return None
        if model.adjusted_at is None:
            model.original_points = model.points
            model.original_value = model.value
        model.points = [[point.x, point.y] for point in points]
        model.value = result.value
        model.unit = result.unit
        model.adjusted_at = adjusted_at
        self._session.flush()
        self._session.refresh(model)
        return _to_measurement(model)

    def revert_geometry(
        self,
        image_id: int,
        measurement_id: int,
    ) -> Measurement | None:
        """Put a corrected measurement back to the geometry it was produced with.

        Returns ``None`` when the measurement is missing, belongs to a different
        image, or was never corrected -- there is nothing to revert to.
        """
        model = self._session.get(MeasurementModel, measurement_id)
        if model is None or model.image_id != image_id:
            return None
        if model.adjusted_at is None or model.original_points is None:
            return None
        model.points = model.original_points
        model.value = model.original_value if model.original_value is not None else 0.0
        model.original_points = None
        model.original_value = None
        model.adjusted_at = None
        self._session.flush()
        self._session.refresh(model)
        return _to_measurement(model)

    def delete_all(self) -> None:
        for model in self._session.scalars(select(MeasurementModel)):
            self._session.delete(model)


def _class_stat_from_entry(entry: dict[str, object]) -> SegmentationClassStat:
    """Rebuild a class statistic from its JSONB representation.

    JSONB values arrive typed as ``object``; each field is coerced back to its
    concrete numeric type. ``mean_intensity`` and ``area_nm2`` may be null.
    """
    intensity_range = cast("list[float]", entry["intensity_range"])
    mean_intensity = entry["mean_intensity"]
    area_nm2 = entry["area_nm2"]
    return SegmentationClassStat(
        class_index=int(cast("int", entry["class_index"])),
        intensity_range=(float(intensity_range[0]), float(intensity_range[1])),
        pixels=int(cast("int", entry["pixels"])),
        area_fraction=float(cast("float", entry["area_fraction"])),
        mean_intensity=(
            None if mean_intensity is None else float(cast("float", mean_intensity))
        ),
        area_nm2=(None if area_nm2 is None else float(cast("float", area_nm2))),
    )


def _to_segmentation_result(model: SegmentationResultModel) -> SegmentationResult:
    return SegmentationResult(
        id=model.id,
        image_id=model.image_id,
        method=model.method,
        classes=model.classes,
        denoise_weight=model.denoise_weight,
        min_size=model.min_size,
        thresholds=tuple(float(value) for value in model.thresholds),
        class_stats=tuple(
            _class_stat_from_entry(entry) for entry in model.class_stats
        ),
        map_path=model.map_path,
        boundary_path=model.boundary_path,
        labels_path=model.labels_path,
        tagged_path=model.tagged_path,
        duration_ms=model.duration_ms,
        downscaled=model.downscaled,
        created_at=model.created_at,
    )


class SegmentationResultRepository:
    """At most one multi-Otsu segmentation per image."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def find_by_image(self, image_id: int) -> SegmentationResult | None:
        model = self._session.scalar(
            select(SegmentationResultModel).where(
                SegmentationResultModel.image_id == image_id
            )
        )
        return _to_segmentation_result(model) if model else None

    def delete_by_image(self, image_id: int) -> SegmentationResult | None:
        """Remove an image's segmentation row, returning the prior value.

        The caller uses the returned paths to delete the now-orphaned derived
        files after the row is committed.
        """
        model = self._session.scalar(
            select(SegmentationResultModel).where(
                SegmentationResultModel.image_id == image_id
            )
        )
        if model is None:
            return None
        prior = _to_segmentation_result(model)
        self._session.delete(model)
        self._session.flush()
        return prior

    def upsert(
        self,
        *,
        image_id: int,
        method: str,
        classes: int,
        denoise_weight: float,
        min_size: int,
        thresholds: tuple[float, ...],
        class_stats: tuple[SegmentationClassStat, ...],
        map_path: str,
        boundary_path: str,
        labels_path: str,
        tagged_path: str | None,
        duration_ms: int,
        downscaled: bool,
    ) -> SegmentationResult:
        """Insert or replace the single segmentation row for an image.

        Uses an ON CONFLICT upsert on ``image_id`` so two concurrent runs on the
        same image resolve to one row rather than a unique-constraint failure.
        """
        payload = {
            "image_id": image_id,
            "method": method,
            "classes": classes,
            "denoise_weight": denoise_weight,
            "min_size": min_size,
            "thresholds": list(thresholds),
            "class_stats": [
                {
                    "class_index": stat.class_index,
                    "intensity_range": list(stat.intensity_range),
                    "pixels": stat.pixels,
                    "area_fraction": stat.area_fraction,
                    "mean_intensity": stat.mean_intensity,
                    "area_nm2": stat.area_nm2,
                }
                for stat in class_stats
            ],
            "map_path": map_path,
            "boundary_path": boundary_path,
            "labels_path": labels_path,
            "tagged_path": tagged_path,
            "duration_ms": duration_ms,
            "downscaled": downscaled,
        }
        statement = pg_insert(SegmentationResultModel).values(**payload)
        statement = statement.on_conflict_do_update(
            index_elements=[SegmentationResultModel.image_id],
            set_={key: statement.excluded[key] for key in payload if key != "image_id"},
        )
        self._session.execute(statement)
        self._session.flush()
        result = self.find_by_image(image_id)
        if result is None:  # pragma: no cover - upsert always leaves a row
            raise RuntimeError("Segmentation upsert did not persist a row.")
        return result

    def set_tagged_path(self, image_id: int, tagged_path: str | None) -> None:
        model = self._session.scalar(
            select(SegmentationResultModel).where(
                SegmentationResultModel.image_id == image_id
            )
        )
        if model is not None:
            model.tagged_path = tagged_path
            self._session.flush()


def database_clock(session: Session) -> datetime:
    """Return the PostgreSQL transaction timestamp for summary responses."""
    value = session.scalar(select(func.now()))
    if value is None:
        raise RuntimeError("Database did not return a transaction timestamp.")
    return value

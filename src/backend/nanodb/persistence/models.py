"""SQLAlchemy mappings for the NANoDB PostgreSQL schema."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

_MEASUREMENT_TYPE_CHECK = "measurement_type IN ('length', 'angle', 'curvature')"


class Base(DeclarativeBase):
    pass


class ImageModel(Base):
    __tablename__ = "images"
    __table_args__ = (
        CheckConstraint(
            "calibration_nm_per_pixel > 0",
            name="ck_images_positive_calibration",
        ),
        CheckConstraint("pixel_width > 0", name="ck_images_positive_width"),
        CheckConstraint("pixel_height > 0", name="ck_images_positive_height"),
        Index("ix_images_created_id", "created_at", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    stored_filename: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False
    )
    display_filename: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    image_type: Mapped[str] = mapped_column(String(64), nullable=False)
    product_id: Mapped[str] = mapped_column(String(255), nullable=False)
    lot_id: Mapped[str] = mapped_column(String(255), nullable=False)
    wafer_id: Mapped[str] = mapped_column(String(255), nullable=False)
    process_step: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    calibration_nm_per_pixel: Mapped[float] = mapped_column(Float, nullable=False)
    pixel_width: Mapped[int] = mapped_column(Integer, nullable=False)
    pixel_height: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    measurements: Mapped[list[MeasurementModel]] = relationship(
        back_populates="image",
        cascade="save-update, merge",
    )


class MeasurementItemModel(Base):
    """A named measurement definition scoped to one product."""

    __tablename__ = "measurement_items"
    __table_args__ = (
        CheckConstraint(
            _MEASUREMENT_TYPE_CHECK,
            name="ck_measurement_items_type",
        ),
        UniqueConstraint(
            "product_id", "name", name="uq_measurement_items_product_name"
        ),
        Index("ix_measurement_items_product", "product_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    measurement_type: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class MeasurementModel(Base):
    __tablename__ = "measurements"
    __table_args__ = (
        CheckConstraint(
            _MEASUREMENT_TYPE_CHECK,
            name="ck_measurements_type",
        ),
        CheckConstraint(
            "calibration_nm_per_pixel > 0",
            name="ck_measurements_positive_calibration",
        ),
        CheckConstraint("value > 0", name="ck_measurements_positive_value"),
        CheckConstraint(
            "source IN ('manual', 'auto')", name="ck_measurements_source"
        ),
        CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            name="ck_measurements_confidence_range",
        ),
        CheckConstraint(
            "(adjusted_at IS NULL AND original_points IS NULL "
            "AND original_value IS NULL) OR (adjusted_at IS NOT NULL "
            "AND original_points IS NOT NULL AND original_value IS NOT NULL)",
            name="ck_measurements_adjustment_complete",
        ),
        Index("ix_measurements_image_created", "image_id", "created_at", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    image_id: Mapped[int] = mapped_column(
        ForeignKey("images.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # A product measurement item defines the name and type; keep the measurement
    # if the item is later removed, so evidence outlives its definition.
    item_id: Mapped[int | None] = mapped_column(
        ForeignKey("measurement_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    measurement_type: Mapped[str] = mapped_column(String(16), nullable=False)
    # Ordered original-pixel points: [[x, y], ...]. 2 for length, 3 otherwise.
    points: Mapped[list[list[float]]] = mapped_column(JSONB, nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(8), nullable=False)
    calibration_nm_per_pixel: Mapped[float] = mapped_column(Float, nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Provenance of the measurement: 'manual' (human-drawn) or 'auto' (feature
    # extractor). 'confidence' is a 0..1 self-estimate, present only for 'auto'.
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="manual"
    )
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Correction trail. 'points'/'value' always hold what the measurement reads
    # now; these hold what it read when first produced, written once on the
    # first correction so the machine's (or the first hand-placed) answer is
    # never lost. All three are NULL while the measurement is uncorrected.
    # ``none_as_null`` so clearing the trail writes SQL NULL rather than a JSON
    # 'null', which would satisfy the column but not the check constraint below.
    original_points: Mapped[list[list[float]] | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )
    original_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    adjusted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    image: Mapped[ImageModel] = relationship(back_populates="measurements")


class CatalogOptionModel(Base):
    """A selectable value in one managed lookup list (registration comboboxes)."""

    __tablename__ = "catalog_options"
    __table_args__ = (
        CheckConstraint(
            "category IN "
            "('image_type', 'product_id', 'lot_id', 'wafer_id', 'process_step')",
            name="ck_catalog_options_category",
        ),
        UniqueConstraint("category", "value", name="uq_catalog_options_category_value"),
        Index("ix_catalog_options_category", "category"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    is_predefined: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class SegmentationResultModel(Base):
    """The multi-Otsu segmentation of one image; at most one per image.

    Deleting the image cascades to this row (ON DELETE CASCADE); the service
    removes the derived files separately, since the database does not own them.
    """

    __tablename__ = "segmentation_results"
    __table_args__ = (
        CheckConstraint(
            "classes >= 2 AND classes <= 6", name="ck_segmentation_classes"
        ),
        CheckConstraint("denoise_weight > 0", name="ck_segmentation_denoise_weight"),
        CheckConstraint("min_size >= 0", name="ck_segmentation_min_size"),
        CheckConstraint("duration_ms >= 0", name="ck_segmentation_duration"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    image_id: Mapped[int] = mapped_column(
        ForeignKey("images.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    method: Mapped[str] = mapped_column(String(64), nullable=False)
    classes: Mapped[int] = mapped_column(Integer, nullable=False)
    denoise_weight: Mapped[float] = mapped_column(Float, nullable=False)
    min_size: Mapped[int] = mapped_column(Integer, nullable=False)
    thresholds: Mapped[list[float]] = mapped_column(JSONB, nullable=False)
    class_stats: Mapped[list[dict[str, object]]] = mapped_column(JSONB, nullable=False)
    map_path: Mapped[str] = mapped_column(String(512), nullable=False)
    boundary_path: Mapped[str] = mapped_column(String(512), nullable=False)
    labels_path: Mapped[str] = mapped_column(String(512), nullable=False)
    tagged_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    downscaled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

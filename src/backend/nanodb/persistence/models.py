"""SQLAlchemy mappings for the NANoDB PostgreSQL schema."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class ImageModel(Base):
    __tablename__ = "images"
    __table_args__ = (
        CheckConstraint("image_type IN ('SEM', 'TEM')", name="ck_images_type"),
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
    image_type: Mapped[str] = mapped_column(String(3), nullable=False)
    product_id: Mapped[str] = mapped_column(String(255), nullable=False)
    lot_id: Mapped[str] = mapped_column(String(255), nullable=False)
    wafer_id: Mapped[str] = mapped_column(String(255), nullable=False)
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
    annotations: Mapped[list[AnnotationModel]] = relationship(
        back_populates="image",
        cascade="save-update, merge",
    )


class MeasurementModel(Base):
    __tablename__ = "measurements"
    __table_args__ = (
        CheckConstraint(
            "parameter_type IN ('CD', 'Depth', 'Thickness')",
            name="ck_measurements_parameter_type",
        ),
        CheckConstraint(
            "start_x >= 0 AND start_y >= 0 AND end_x >= 0 AND end_y >= 0",
            name="ck_measurements_nonnegative_coordinates",
        ),
        CheckConstraint(
            "start_x <> end_x OR start_y <> end_y",
            name="ck_measurements_distinct_points",
        ),
        CheckConstraint("distance_px > 0", name="ck_measurements_positive_distance"),
        CheckConstraint(
            "calibration_nm_per_pixel > 0",
            name="ck_measurements_positive_calibration",
        ),
        CheckConstraint("value_nm > 0", name="ck_measurements_positive_value"),
        Index("ix_measurements_image_created", "image_id", "created_at", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    image_id: Mapped[int] = mapped_column(
        ForeignKey("images.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    parameter_type: Mapped[str] = mapped_column(String(16), nullable=False)
    start_x: Mapped[float] = mapped_column(Float, nullable=False)
    start_y: Mapped[float] = mapped_column(Float, nullable=False)
    end_x: Mapped[float] = mapped_column(Float, nullable=False)
    end_y: Mapped[float] = mapped_column(Float, nullable=False)
    distance_px: Mapped[float] = mapped_column(Float, nullable=False)
    calibration_nm_per_pixel: Mapped[float] = mapped_column(Float, nullable=False)
    value_nm: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    image: Mapped[ImageModel] = relationship(back_populates="measurements")


class AnnotationModel(Base):
    __tablename__ = "annotations"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('arrow', 'circle')",
            name="ck_annotations_kind",
        ),
        CheckConstraint(
            "product IS NULL OR product IN ('DRAM', 'Flash', 'Logic', 'Sensor')",
            name="ck_annotations_product",
        ),
        CheckConstraint(
            "start_x >= 0 AND start_y >= 0 AND end_x >= 0 AND end_y >= 0",
            name="ck_annotations_nonnegative_coordinates",
        ),
        CheckConstraint(
            "start_x <> end_x OR start_y <> end_y",
            name="ck_annotations_distinct_points",
        ),
        Index("ix_annotations_image_created", "image_id", "created_at", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    image_id: Mapped[int] = mapped_column(
        ForeignKey("images.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    start_x: Mapped[float] = mapped_column(Float, nullable=False)
    start_y: Mapped[float] = mapped_column(Float, nullable=False)
    end_x: Mapped[float] = mapped_column(Float, nullable=False)
    end_y: Mapped[float] = mapped_column(Float, nullable=False)
    product: Mapped[str | None] = mapped_column(String(16), nullable=True)
    step: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=""
    )
    measurement_name: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=""
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    image: Mapped[ImageModel] = relationship(back_populates="annotations")

"""Create NANoDB Core Image and Measurement tables."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260908_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "images",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("original_filename", sa.String(512), nullable=False),
        sa.Column("stored_filename", sa.String(255), nullable=False, unique=True),
        sa.Column("image_type", sa.String(3), nullable=False),
        sa.Column("product_id", sa.String(255), nullable=False),
        sa.Column("lot_id", sa.String(255), nullable=False),
        sa.Column("wafer_id", sa.String(255), nullable=False),
        sa.Column("calibration_nm_per_pixel", sa.Float(), nullable=False),
        sa.Column("pixel_width", sa.Integer(), nullable=False),
        sa.Column("pixel_height", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("image_type IN ('SEM', 'TEM')", name="ck_images_type"),
        sa.CheckConstraint(
            "calibration_nm_per_pixel > 0",
            name="ck_images_positive_calibration",
        ),
        sa.CheckConstraint("pixel_width > 0", name="ck_images_positive_width"),
        sa.CheckConstraint("pixel_height > 0", name="ck_images_positive_height"),
    )
    op.create_index("ix_images_created_id", "images", ["created_at", "id"])

    op.create_table(
        "measurements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "image_id",
            sa.Integer(),
            sa.ForeignKey("images.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("parameter_type", sa.String(16), nullable=False),
        sa.Column("start_x", sa.Float(), nullable=False),
        sa.Column("start_y", sa.Float(), nullable=False),
        sa.Column("end_x", sa.Float(), nullable=False),
        sa.Column("end_y", sa.Float(), nullable=False),
        sa.Column("distance_px", sa.Float(), nullable=False),
        sa.Column("calibration_nm_per_pixel", sa.Float(), nullable=False),
        sa.Column("value_nm", sa.Float(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "parameter_type IN ('CD', 'Depth', 'Thickness')",
            name="ck_measurements_parameter_type",
        ),
        sa.CheckConstraint(
            "start_x >= 0 AND start_y >= 0 AND end_x >= 0 AND end_y >= 0",
            name="ck_measurements_nonnegative_coordinates",
        ),
        sa.CheckConstraint(
            "start_x <> end_x OR start_y <> end_y",
            name="ck_measurements_distinct_points",
        ),
        sa.CheckConstraint(
            "distance_px > 0",
            name="ck_measurements_positive_distance",
        ),
        sa.CheckConstraint(
            "calibration_nm_per_pixel > 0",
            name="ck_measurements_positive_calibration",
        ),
        sa.CheckConstraint("value_nm > 0", name="ck_measurements_positive_value"),
    )
    op.create_index("ix_measurements_image_id", "measurements", ["image_id"])
    op.create_index(
        "ix_measurements_image_created",
        "measurements",
        ["image_id", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_measurements_image_created", table_name="measurements")
    op.drop_index("ix_measurements_image_id", table_name="measurements")
    op.drop_table("measurements")
    op.drop_index("ix_images_created_id", table_name="images")
    op.drop_table("images")

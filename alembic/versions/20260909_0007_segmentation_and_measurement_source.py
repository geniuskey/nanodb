"""Add segmentation results and measurement provenance.

Two changes support automatic segmentation and feature extraction:

1. A ``segmentation_results`` table holds the multi-Otsu segmentation of an
   image (thresholds, per-class statistics and the derived-file paths). At most
   one row exists per image; deleting the image cascades to it.
2. ``measurements`` gains ``source`` ('manual' | 'auto') and a nullable 0..1
   ``confidence``. Existing rows are all human-drawn, so they backfill to
   'manual' via the column default.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260909_0007"
down_revision: str | None = "20260908_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "measurements",
        sa.Column(
            "source",
            sa.String(16),
            nullable=False,
            server_default="manual",
        ),
    )
    op.add_column(
        "measurements",
        sa.Column("confidence", sa.Float(), nullable=True),
    )
    op.create_check_constraint(
        "ck_measurements_source", "measurements", "source IN ('manual', 'auto')"
    )
    op.create_check_constraint(
        "ck_measurements_confidence_range",
        "measurements",
        "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
    )

    op.create_table(
        "segmentation_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "image_id",
            sa.Integer(),
            sa.ForeignKey("images.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("method", sa.String(64), nullable=False),
        sa.Column("classes", sa.Integer(), nullable=False),
        sa.Column("denoise_weight", sa.Float(), nullable=False),
        sa.Column("min_size", sa.Integer(), nullable=False),
        sa.Column("thresholds", postgresql.JSONB(), nullable=False),
        sa.Column("class_stats", postgresql.JSONB(), nullable=False),
        sa.Column("map_path", sa.String(512), nullable=False),
        sa.Column("boundary_path", sa.String(512), nullable=False),
        sa.Column("labels_path", sa.String(512), nullable=False),
        sa.Column("tagged_path", sa.String(512), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column(
            "downscaled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "classes >= 2 AND classes <= 6", name="ck_segmentation_classes"
        ),
        sa.CheckConstraint("denoise_weight > 0", name="ck_segmentation_denoise_weight"),
        sa.CheckConstraint("min_size >= 0", name="ck_segmentation_min_size"),
        sa.CheckConstraint("duration_ms >= 0", name="ck_segmentation_duration"),
    )
    op.create_index(
        "ix_segmentation_results_image", "segmentation_results", ["image_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_segmentation_results_image", table_name="segmentation_results")
    op.drop_table("segmentation_results")

    op.drop_constraint(
        "ck_measurements_confidence_range", "measurements", type_="check"
    )
    op.drop_constraint("ck_measurements_source", "measurements", type_="check")
    op.drop_column("measurements", "confidence")
    op.drop_column("measurements", "source")

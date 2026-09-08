"""Create the annotations table for arrow/circle labeling shapes."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260908_0003"
down_revision: str | None = "20260908_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "annotations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "image_id",
            sa.Integer(),
            sa.ForeignKey("images.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("start_x", sa.Float(), nullable=False),
        sa.Column("start_y", sa.Float(), nullable=False),
        sa.Column("end_x", sa.Float(), nullable=False),
        sa.Column("end_y", sa.Float(), nullable=False),
        sa.Column("product", sa.String(16), nullable=True),
        sa.Column("step", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "measurement_name", sa.Text(), nullable=False, server_default=""
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('arrow', 'circle')",
            name="ck_annotations_kind",
        ),
        sa.CheckConstraint(
            "product IS NULL OR product IN ('DRAM', 'Flash', 'Logic', 'Sensor')",
            name="ck_annotations_product",
        ),
        sa.CheckConstraint(
            "start_x >= 0 AND start_y >= 0 AND end_x >= 0 AND end_y >= 0",
            name="ck_annotations_nonnegative_coordinates",
        ),
        sa.CheckConstraint(
            "start_x <> end_x OR start_y <> end_y",
            name="ck_annotations_distinct_points",
        ),
    )
    op.create_index("ix_annotations_image_id", "annotations", ["image_id"])
    op.create_index(
        "ix_annotations_image_created",
        "annotations",
        ["image_id", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_annotations_image_created", table_name="annotations")
    op.drop_index("ix_annotations_image_id", table_name="annotations")
    op.drop_table("annotations")

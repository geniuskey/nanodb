"""Create managed catalog_options lists and relax image_type to free text.

image_type stops being a fixed SEM/TEM enum: operators can register new
imaging modalities, so the CHECK constraint is dropped and the column widened.
The catalog is seeded with the shipped defaults (TEM/SEM, W01-W25) as
predefined options, plus any distinct values already present on existing
images so the lists reflect the current database.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260908_0005"
down_revision: str | None = "20260908_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


CATEGORIES = ("image_type", "product_id", "lot_id", "wafer_id", "process_step")


def upgrade() -> None:
    op.create_table(
        "catalog_options",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("value", sa.String(255), nullable=False),
        sa.Column(
            "is_predefined",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "category IN "
            "('image_type', 'product_id', 'lot_id', 'wafer_id', 'process_step')",
            name="ck_catalog_options_category",
        ),
        sa.UniqueConstraint(
            "category", "value", name="uq_catalog_options_category_value"
        ),
    )
    op.create_index(
        "ix_catalog_options_category", "catalog_options", ["category"]
    )

    # image_type becomes a managed free-text value.
    op.drop_constraint("ck_images_type", "images", type_="check")
    op.alter_column(
        "images",
        "image_type",
        existing_type=sa.String(3),
        type_=sa.String(64),
        existing_nullable=False,
    )

    _seed_defaults()
    _seed_from_existing_images()


def _seed_defaults() -> None:
    options = sa.table(
        "catalog_options",
        sa.column("category", sa.String),
        sa.column("value", sa.String),
        sa.column("is_predefined", sa.Boolean),
    )
    rows = [
        {"category": "image_type", "value": "TEM", "is_predefined": True},
        {"category": "image_type", "value": "SEM", "is_predefined": True},
    ]
    rows += [
        {"category": "wafer_id", "value": f"W{index:02d}", "is_predefined": True}
        for index in range(1, 26)
    ]
    op.bulk_insert(options, rows)


def _seed_from_existing_images() -> None:
    """Copy distinct values already on images into the catalog as custom
    (non-predefined) options, skipping anything already seeded."""
    bind = op.get_bind()
    for category in CATEGORIES:
        bind.execute(
            sa.text(
                f"""
                INSERT INTO catalog_options (category, value, is_predefined)
                SELECT :category, {category}, false
                FROM (SELECT DISTINCT {category} FROM images) AS distinct_values
                WHERE {category} IS NOT NULL AND {category} <> ''
                ON CONFLICT (category, value) DO NOTHING
                """  # noqa: S608 - category is from a fixed allowlist, not user input
            ),
            {"category": category},
        )


def downgrade() -> None:
    op.alter_column(
        "images",
        "image_type",
        existing_type=sa.String(64),
        type_=sa.String(3),
        existing_nullable=False,
    )
    op.create_check_constraint(
        "ck_images_type",
        "images",
        "image_type IN ('SEM', 'TEM')",
    )
    op.drop_index("ix_catalog_options_category", table_name="catalog_options")
    op.drop_table("catalog_options")

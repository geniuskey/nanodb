"""Replace two-point CD/Depth/Thickness measurements with typed geometry.

The measurement model is generalised from a single two-point length labelled by
a fixed CD/Depth/Thickness parameter to three geometry types -- length, angle
and curvature -- each stored as an ordered ``points`` list with a computed
``value`` and its ``unit``. A new per-product ``measurement_items`` table names
what is measured and fixes its type; measurements reference an item via a
nullable ``item_id`` (SET NULL) so evidence outlives a deleted definition.

Existing rows are migrated as length measurements: their two endpoints become a
two-point list, ``value_nm`` becomes ``value`` with unit ``nm``, and ``item_id``
is left null since no per-product items existed before this migration.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260908_0006"
down_revision: str | None = "20260908_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TYPE_CHECK = "measurement_type IN ('length', 'angle', 'curvature')"


def upgrade() -> None:
    op.create_table(
        "measurement_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("measurement_type", sa.String(16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(_TYPE_CHECK, name="ck_measurement_items_type"),
        sa.UniqueConstraint(
            "product_id", "name", name="uq_measurement_items_product_name"
        ),
    )
    op.create_index("ix_measurement_items_product", "measurement_items", ["product_id"])

    # New generalised columns, added nullable so existing rows can be backfilled.
    op.add_column(
        "measurements",
        sa.Column(
            "item_id",
            sa.Integer(),
            sa.ForeignKey("measurement_items.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "measurements",
        sa.Column("measurement_type", sa.String(16), nullable=True),
    )
    op.add_column(
        "measurements",
        sa.Column("points", postgresql.JSONB(), nullable=True),
    )
    op.add_column("measurements", sa.Column("value", sa.Float(), nullable=True))
    op.add_column("measurements", sa.Column("unit", sa.String(8), nullable=True))

    # Backfill: every legacy row is a two-point length in nanometres.
    op.execute(
        sa.text(
            """
            UPDATE measurements
            SET measurement_type = 'length',
                points = jsonb_build_array(
                    jsonb_build_array(start_x, start_y),
                    jsonb_build_array(end_x, end_y)
                ),
                value = value_nm,
                unit = 'nm'
            """
        )
    )

    op.alter_column("measurements", "measurement_type", nullable=False)
    op.alter_column("measurements", "points", nullable=False)
    op.alter_column("measurements", "value", nullable=False)
    op.alter_column("measurements", "unit", nullable=False)

    # Drop the legacy two-point length constraints and columns.
    op.drop_constraint("ck_measurements_parameter_type", "measurements", type_="check")
    op.drop_constraint(
        "ck_measurements_nonnegative_coordinates", "measurements", type_="check"
    )
    op.drop_constraint("ck_measurements_distinct_points", "measurements", type_="check")
    op.drop_constraint(
        "ck_measurements_positive_distance", "measurements", type_="check"
    )
    op.drop_constraint("ck_measurements_positive_value", "measurements", type_="check")
    op.drop_column("measurements", "parameter_type")
    op.drop_column("measurements", "start_x")
    op.drop_column("measurements", "start_y")
    op.drop_column("measurements", "end_x")
    op.drop_column("measurements", "end_y")
    op.drop_column("measurements", "distance_px")
    op.drop_column("measurements", "value_nm")

    op.create_check_constraint("ck_measurements_type", "measurements", _TYPE_CHECK)
    op.create_check_constraint(
        "ck_measurements_positive_value", "measurements", "value > 0"
    )


def downgrade() -> None:
    op.drop_constraint("ck_measurements_positive_value", "measurements", type_="check")
    op.drop_constraint("ck_measurements_type", "measurements", type_="check")

    op.add_column(
        "measurements", sa.Column("parameter_type", sa.String(16), nullable=True)
    )
    op.add_column("measurements", sa.Column("start_x", sa.Float(), nullable=True))
    op.add_column("measurements", sa.Column("start_y", sa.Float(), nullable=True))
    op.add_column("measurements", sa.Column("end_x", sa.Float(), nullable=True))
    op.add_column("measurements", sa.Column("end_y", sa.Float(), nullable=True))
    op.add_column("measurements", sa.Column("distance_px", sa.Float(), nullable=True))
    op.add_column("measurements", sa.Column("value_nm", sa.Float(), nullable=True))

    # Only length measurements can be represented in the legacy two-point shape;
    # angle and curvature rows have no equivalent and are dropped.
    op.execute(sa.text("DELETE FROM measurements WHERE measurement_type <> 'length'"))
    op.execute(
        sa.text(
            """
            UPDATE measurements
            SET parameter_type = 'CD',
                start_x = (points->0->>0)::double precision,
                start_y = (points->0->>1)::double precision,
                end_x = (points->1->>0)::double precision,
                end_y = (points->1->>1)::double precision,
                distance_px = value / calibration_nm_per_pixel,
                value_nm = value
            """
        )
    )

    op.alter_column("measurements", "parameter_type", nullable=False)
    op.alter_column("measurements", "start_x", nullable=False)
    op.alter_column("measurements", "start_y", nullable=False)
    op.alter_column("measurements", "end_x", nullable=False)
    op.alter_column("measurements", "end_y", nullable=False)
    op.alter_column("measurements", "distance_px", nullable=False)
    op.alter_column("measurements", "value_nm", nullable=False)

    op.create_check_constraint(
        "ck_measurements_parameter_type",
        "measurements",
        "parameter_type IN ('CD', 'Depth', 'Thickness')",
    )
    op.create_check_constraint(
        "ck_measurements_nonnegative_coordinates",
        "measurements",
        "start_x >= 0 AND start_y >= 0 AND end_x >= 0 AND end_y >= 0",
    )
    op.create_check_constraint(
        "ck_measurements_distinct_points",
        "measurements",
        "start_x <> end_x OR start_y <> end_y",
    )
    op.create_check_constraint(
        "ck_measurements_positive_distance", "measurements", "distance_px > 0"
    )
    op.create_check_constraint(
        "ck_measurements_positive_value", "measurements", "value_nm > 0"
    )

    op.drop_column("measurements", "unit")
    op.drop_column("measurements", "value")
    op.drop_column("measurements", "points")
    op.drop_column("measurements", "measurement_type")
    op.drop_column("measurements", "item_id")

    op.drop_index("ix_measurement_items_product", table_name="measurement_items")
    op.drop_table("measurement_items")

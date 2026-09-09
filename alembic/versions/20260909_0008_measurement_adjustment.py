"""Let a saved measurement's points be corrected, keeping what it first read.

Automatic feature extraction is not exact, and a hand-placed point can miss, so
the points of a saved measurement can now be moved. The correction is never
silent: ``original_points`` and ``original_value`` hold the geometry and value
as first produced (written once, on the first correction), and ``adjusted_at``
records when a person moved them.

Existing rows are all uncorrected, so all three columns backfill to NULL. A
check constraint keeps the trail whole: either all three are set or none are.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260909_0008"
down_revision: str | None = "20260909_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "measurements",
        sa.Column("original_points", postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        "measurements",
        sa.Column("original_value", sa.Float(), nullable=True),
    )
    op.add_column(
        "measurements",
        sa.Column("adjusted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_measurements_adjustment_complete",
        "measurements",
        "(adjusted_at IS NULL AND original_points IS NULL "
        "AND original_value IS NULL) OR (adjusted_at IS NOT NULL "
        "AND original_points IS NOT NULL AND original_value IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_measurements_adjustment_complete", "measurements", type_="check"
    )
    op.drop_column("measurements", "adjusted_at")
    op.drop_column("measurements", "original_value")
    op.drop_column("measurements", "original_points")

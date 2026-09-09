"""Store the grey-level histogram of each multi-Otsu segmentation.

The demo segmentation view shows a grey-level histogram of the denoised image
with the Otsu thresholds overlaid. That distribution is now computed on the
backend (skimage ``exposure.histogram``) and persisted so the frontend renders
the real data instead of approximating it from per-class area fractions.

The column is nullable JSONB (``{"bin_centers": [...], "counts": [...]}``):
existing segmentation rows backfill to NULL and keep working until re-run.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260909_0011"
down_revision: str | None = "20260909_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "segmentation_results",
        sa.Column("histogram", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("segmentation_results", "histogram")

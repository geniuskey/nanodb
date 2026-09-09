"""Add a free-text note (비고) to an image.

An operator often needs to record a remark about the whole image -- a caveat
about the sample, a reference to a ticket, anything that is not a measurement.
The column is optional free text: existing rows backfill to NULL and the field
never participates in the catalog (it is per-image, not a reusable value).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260909_0010"
down_revision: str | None = "20260909_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("images", sa.Column("note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("images", "note")

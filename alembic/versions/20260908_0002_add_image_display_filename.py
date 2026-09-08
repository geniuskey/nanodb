"""Add images.display_filename for browser-renderable derivatives (e.g. TIFF)."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260908_0002"
down_revision: str | None = "20260908_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "images",
        sa.Column("display_filename", sa.String(255), nullable=True),
    )
    op.create_unique_constraint(
        "uq_images_display_filename",
        "images",
        ["display_filename"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_images_display_filename",
        "images",
        type_="unique",
    )
    op.drop_column("images", "display_filename")

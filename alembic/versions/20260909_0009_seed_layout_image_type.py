"""Seed 'Layout' as a predefined image_type catalog option.

'Layout' joins TEM/SEM as a shipped default imaging modality. The insert is
idempotent (``ON CONFLICT DO NOTHING``) so it is safe whether or not an
operator has already registered a matching value by hand: an existing row of
the same (category, value) is left untouched.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260909_0009"
down_revision: str | None = "20260909_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.get_bind().execute(
        sa.text(
            """
            INSERT INTO catalog_options (category, value, is_predefined)
            VALUES ('image_type', 'Layout', true)
            ON CONFLICT (category, value) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text(
            """
            DELETE FROM catalog_options
            WHERE category = 'image_type'
              AND value = 'Layout'
              AND is_predefined = true
            """
        )
    )

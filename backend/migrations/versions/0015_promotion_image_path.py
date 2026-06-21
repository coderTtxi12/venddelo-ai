"""promotion promotional image path

Revision ID: 0015_promo_image
Revises: 0014_bundle_pairing
Create Date: 2026-06-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_promo_image"
down_revision: str | None = "0014_bundle_pairing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("promotions", sa.Column("image_path", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("promotions", "image_path")

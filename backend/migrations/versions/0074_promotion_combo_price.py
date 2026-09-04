"""promotion combo_price_cents

Revision ID: 0074_promotion_combo_price
Revises: 0073_coupon_starts_on
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0074_promotion_combo_price"
down_revision: str | None = "0073_coupon_starts_on"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "promotions",
        sa.Column("combo_price_cents", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("promotions", "combo_price_cents")

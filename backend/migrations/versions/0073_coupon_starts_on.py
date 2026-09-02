"""coupon starts_on date

Revision ID: 0073_coupon_starts_on
Revises: 0072_promotion_show_banner_free_shipping
Create Date: 2026-09-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0073_coupon_starts_on"
down_revision: str | None = "0072_promotion_show_banner_free_shipping"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("coupons", sa.Column("starts_on", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("coupons", "starts_on")

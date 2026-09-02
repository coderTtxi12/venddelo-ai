"""promotion show_banner and free_shipping type

Revision ID: 0072_promotion_show_banner_free_shipping
Revises: 0071_coupon_recurrence_weekdays
Create Date: 2026-09-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0072_promotion_show_banner_free_shipping"
down_revision: str | None = "0071_coupon_recurrence_weekdays"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "promotions",
        sa.Column("show_banner", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.execute(
        """
        UPDATE promotions
        SET show_banner = false
        WHERE name LIKE '__product_discount__%'
        """
    )
    op.drop_constraint("promotion_type_allowed", "promotions", type_="check")
    op.create_check_constraint(
        "promotion_type_allowed",
        "promotions",
        "type IN ('percent','amount','combo','two_for_one','free_shipping')",
    )


def downgrade() -> None:
    op.drop_constraint("promotion_type_allowed", "promotions", type_="check")
    op.create_check_constraint(
        "promotion_type_allowed",
        "promotions",
        "type IN ('percent','amount','combo','two_for_one')",
    )
    op.drop_column("promotions", "show_banner")

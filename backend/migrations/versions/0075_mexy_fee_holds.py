"""mexy fee cents and typed credit holds

Revision ID: 0075_mexy_fee_holds
Revises: 0074_promotion_combo_price
Create Date: 2026-09-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0075_mexy_fee_holds"
down_revision: str | None = "0074_promotion_combo_price"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "delivery_dispatch_requests",
        sa.Column("mexy_fee_cents", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "delivery_credit_holds",
        sa.Column(
            "kind",
            sa.String(),
            nullable=False,
            server_default="restaurant_cash",
        ),
    )
    op.create_check_constraint(
        "ck_delivery_credit_holds_kind_allowed",
        "delivery_credit_holds",
        "kind IN ('restaurant_cash','mexy_fee')",
    )
    op.drop_constraint("uq_delivery_credit_holds_request_id", "delivery_credit_holds", type_="unique")
    op.create_unique_constraint(
        "uq_delivery_credit_holds_request_kind",
        "delivery_credit_holds",
        ["request_id", "kind"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_delivery_credit_holds_request_kind",
        "delivery_credit_holds",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_delivery_credit_holds_request_id",
        "delivery_credit_holds",
        ["request_id"],
    )
    op.drop_constraint(
        "ck_delivery_credit_holds_kind_allowed",
        "delivery_credit_holds",
        type_="check",
    )
    op.drop_column("delivery_credit_holds", "kind")
    op.drop_column("delivery_dispatch_requests", "mexy_fee_cents")

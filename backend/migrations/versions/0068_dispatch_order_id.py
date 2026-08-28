"""link dispatch requests to kitchen orders

Revision ID: 0068_dispatch_order_id
Revises: 0067_provider_rider_apk
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0068_dispatch_order_id"
down_revision: str | None = "0067_provider_rider_apk"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "delivery_dispatch_requests",
        sa.Column("order_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_delivery_dispatch_requests_order_id_orders"),
        "delivery_dispatch_requests",
        "orders",
        ["order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_delivery_dispatch_requests_order_id"),
        "delivery_dispatch_requests",
        ["order_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_delivery_dispatch_requests_order_id"),
        table_name="delivery_dispatch_requests",
    )
    op.drop_constraint(
        op.f("fk_delivery_dispatch_requests_order_id_orders"),
        "delivery_dispatch_requests",
        type_="foreignkey",
    )
    op.drop_column("delivery_dispatch_requests", "order_id")

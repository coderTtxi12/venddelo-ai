"""hide closed kitchen tickets without deleting them

Revision ID: 0064_order_kds_cleared_at
Revises: 0063_public_tracking_realtime
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0064_order_kds_cleared_at"
down_revision: str | None = "0063_public_tracking_realtime"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("kds_cleared_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_orders_kds_cleared_at",
        "orders",
        ["restaurant_id", "kds_cleared_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_orders_kds_cleared_at", table_name="orders")
    op.drop_column("orders", "kds_cleared_at")

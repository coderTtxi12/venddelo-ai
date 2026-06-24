"""order-level applied discount snapshots for kitchen display

Revision ID: 0029_order_applied_discounts
Revises: 0028_order_kitchen_snapshots
Create Date: 2026-06-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0029_order_applied_discounts"
down_revision: str | None = "0028_order_kitchen_snapshots"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "applied_order_discounts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("orders", "applied_order_discounts")

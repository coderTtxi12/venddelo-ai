"""order kitchen snapshots: images, discounts, delivery coords, cancel reason

Revision ID: 0028_order_kitchen_snapshots
Revises: 0027_dedupe_mexy_partnerships
Create Date: 2026-06-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0028_order_kitchen_snapshots"
down_revision: str | None = "0027_dedupe_mexy_partnerships"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("delivery_latitude", sa.Float(), nullable=True))
    op.add_column("orders", sa.Column("delivery_longitude", sa.Float(), nullable=True))
    op.add_column("orders", sa.Column("cancellation_reason", sa.Text(), nullable=True))
    op.add_column("order_items", sa.Column("product_image_path", sa.Text(), nullable=True))
    op.add_column(
        "order_items",
        sa.Column(
            "applied_discounts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("order_items", "applied_discounts")
    op.drop_column("order_items", "product_image_path")
    op.drop_column("orders", "cancellation_reason")
    op.drop_column("orders", "delivery_longitude")
    op.drop_column("orders", "delivery_latitude")

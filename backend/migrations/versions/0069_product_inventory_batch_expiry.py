"""optional product inventory and live-menu inventory flags

Revision ID: 0069_product_inventory_batch_expiry
Revises: 0068_dispatch_order_id
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0069_product_inventory_batch_expiry"
down_revision: str | None = "0068_dispatch_order_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("products", sa.Column("inventory_qty", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("shelf_life_days", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("expires_on", sa.Date(), nullable=True))
    op.add_column(
        "products",
        sa.Column("batch_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_products_inventory_qty_nonneg",
        "products",
        "inventory_qty IS NULL OR inventory_qty >= 0",
    )
    op.create_check_constraint(
        "ck_products_shelf_life_days_pos",
        "products",
        "shelf_life_days IS NULL OR shelf_life_days >= 1",
    )
    op.add_column(
        "restaurants",
        sa.Column(
            "live_menu_inventory_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "restaurants",
        sa.Column(
            "low_stock_threshold",
            sa.Integer(),
            nullable=False,
            server_default="3",
        ),
    )
    op.create_check_constraint(
        "ck_restaurants_low_stock_threshold_pos",
        "restaurants",
        "low_stock_threshold >= 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_restaurants_low_stock_threshold_pos", "restaurants", type_="check")
    op.drop_column("restaurants", "low_stock_threshold")
    op.drop_column("restaurants", "live_menu_inventory_enabled")
    op.drop_constraint("ck_products_shelf_life_days_pos", "products", type_="check")
    op.drop_constraint("ck_products_inventory_qty_nonneg", "products", type_="check")
    op.drop_column("products", "batch_started_at")
    op.drop_column("products", "expires_on")
    op.drop_column("products", "shelf_life_days")
    op.drop_column("products", "inventory_qty")

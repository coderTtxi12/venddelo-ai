"""coupons tables and order snapshot columns

Revision ID: 0070_coupons
Revises: 0069_product_inventory_batch_expiry
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0070_coupons"
down_revision: str | None = "0069_product_inventory_batch_expiry"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "coupons",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("restaurant_id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("percent", sa.Integer(), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=True),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("stock_qty", sa.Integer(), nullable=True),
        sa.Column("expires_on", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "type IN ('amount','percent','free_shipping')",
            name=op.f("ck_coupons_coupon_type_allowed"),
        ),
        sa.CheckConstraint(
            "scope IN ('all','category','product')",
            name=op.f("ck_coupons_coupon_scope_allowed"),
        ),
        sa.CheckConstraint(
            "type <> 'percent' OR (percent BETWEEN 1 AND 100)",
            name=op.f("ck_coupons_coupon_percent_range"),
        ),
        sa.CheckConstraint(
            "type <> 'amount' OR amount_cents > 0",
            name=op.f("ck_coupons_coupon_amount_positive"),
        ),
        sa.CheckConstraint(
            "stock_qty IS NULL OR stock_qty >= 0",
            name=op.f("ck_coupons_coupon_stock_nonneg"),
        ),
        sa.ForeignKeyConstraint(
            ["restaurant_id"],
            ["restaurants.id"],
            name=op.f("fk_coupons_restaurant_id_restaurants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_coupons")),
    )
    op.create_index(
        "uq_coupons_restaurant_code_alive",
        "coupons",
        ["restaurant_id", "code"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "coupon_products",
        sa.Column("coupon_id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["coupon_id"],
            ["coupons.id"],
            name=op.f("fk_coupon_products_coupon_id_coupons"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_coupon_products_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("coupon_id", "product_id", name=op.f("pk_coupon_products")),
    )

    op.create_table(
        "coupon_categories",
        sa.Column("coupon_id", sa.UUID(), nullable=False),
        sa.Column("category_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["coupon_id"],
            ["coupons.id"],
            name=op.f("fk_coupon_categories_coupon_id_coupons"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_coupon_categories_category_id_categories"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("coupon_id", "category_id", name=op.f("pk_coupon_categories")),
    )

    op.create_table(
        "coupon_redemptions",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("coupon_id", sa.UUID(), nullable=False),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["coupon_id"],
            ["coupons.id"],
            name=op.f("fk_coupon_redemptions_coupon_id_coupons"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_coupon_redemptions_order_id_orders"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_coupon_redemptions")),
        sa.UniqueConstraint("order_id", name=op.f("uq_coupon_redemptions_order_id")),
    )

    op.add_column("orders", sa.Column("applied_coupon_id", sa.UUID(), nullable=True))
    op.add_column("orders", sa.Column("applied_coupon_code", sa.Text(), nullable=True))
    op.add_column(
        "orders",
        sa.Column("coupon_discount_cents", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "orders",
        sa.Column(
            "coupon_waived_delivery_cents", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.create_foreign_key(
        op.f("fk_orders_applied_coupon_id_coupons"),
        "orders",
        "coupons",
        ["applied_coupon_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_orders_applied_coupon_id_coupons"), "orders", type_="foreignkey"
    )
    op.drop_column("orders", "coupon_waived_delivery_cents")
    op.drop_column("orders", "coupon_discount_cents")
    op.drop_column("orders", "applied_coupon_code")
    op.drop_column("orders", "applied_coupon_id")

    op.drop_table("coupon_redemptions")
    op.drop_table("coupon_categories")
    op.drop_table("coupon_products")

    op.drop_index(
        "uq_coupons_restaurant_code_alive",
        table_name="coupons",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_table("coupons")

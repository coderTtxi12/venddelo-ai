"""promotions engine: timezone, recurrence, bundle, option items, order discounts

Revision ID: 0013_promotions_engine
Revises: 0012_product_category_sort_index
Create Date: 2026-06-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013_promotions_engine"
down_revision: str | None = "0012_product_category_sort_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurants",
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=False,
            server_default="America/Mexico_City",
        ),
    )

    op.add_column("promotions", sa.Column("bundle_get_quantity", sa.Integer(), nullable=True))
    op.add_column("promotions", sa.Column("bundle_pay_quantity", sa.Integer(), nullable=True))
    op.add_column(
        "promotions",
        sa.Column("recurrence_weekdays", postgresql.ARRAY(sa.SmallInteger()), nullable=True),
    )
    op.add_column("promotions", sa.Column("recurrence_start_time", sa.Time(), nullable=True))
    op.add_column("promotions", sa.Column("recurrence_end_time", sa.Time(), nullable=True))

    op.create_table(
        "promotion_option_items",
        sa.Column("promotion_id", sa.UUID(), nullable=False),
        sa.Column("option_item_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["option_item_id"],
            ["option_items.id"],
            name=op.f("fk_promotion_option_items_option_item_id_option_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["promotion_id"],
            ["promotions.id"],
            name=op.f("fk_promotion_option_items_promotion_id_promotions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "promotion_id", "option_item_id", name=op.f("pk_promotion_option_items")
        ),
    )

    op.add_column(
        "orders",
        sa.Column("discount_cents", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "orders",
        sa.Column(
            "subtotal_before_discount_cents",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column("orders", sa.Column("applied_order_promotion_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_orders_applied_order_promotion_id_promotions"),
        "orders",
        "promotions",
        ["applied_order_promotion_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "order_items",
        sa.Column("discount_cents", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "order_items",
        sa.Column("line_subtotal_cents", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("order_items", sa.Column("applied_promotion_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_order_items_applied_promotion_id_promotions"),
        "order_items",
        "promotions",
        ["applied_promotion_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        """
        UPDATE orders
        SET subtotal_before_discount_cents = subtotal_cents
        WHERE subtotal_before_discount_cents = 0
        """
    )
    op.execute(
        """
        UPDATE order_items
        SET line_subtotal_cents = line_total_cents
        WHERE line_subtotal_cents = 0
        """
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_order_items_applied_promotion_id_promotions"), "order_items", type_="foreignkey"
    )
    op.drop_column("order_items", "applied_promotion_id")
    op.drop_column("order_items", "line_subtotal_cents")
    op.drop_column("order_items", "discount_cents")

    op.drop_constraint(
        op.f("fk_orders_applied_order_promotion_id_promotions"), "orders", type_="foreignkey"
    )
    op.drop_column("orders", "applied_order_promotion_id")
    op.drop_column("orders", "subtotal_before_discount_cents")
    op.drop_column("orders", "discount_cents")

    op.drop_table("promotion_option_items")

    op.drop_column("promotions", "recurrence_end_time")
    op.drop_column("promotions", "recurrence_start_time")
    op.drop_column("promotions", "recurrence_weekdays")
    op.drop_column("promotions", "bundle_pay_quantity")
    op.drop_column("promotions", "bundle_get_quantity")

    op.drop_column("restaurants", "timezone")

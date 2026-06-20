"""product_categories: add sort_index for per-category product ordering

Revision ID: 0012_product_category_sort_index
Revises: 0011_restaurant_service_flags
Create Date: 2026-06-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_product_category_sort_index"
down_revision: str | None = "0011_restaurant_service_flags"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "product_categories",
        sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "ix_product_categories_category_sort",
        "product_categories",
        ["category_id", "sort_index"],
        unique=False,
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT
                product_id,
                category_id,
                ROW_NUMBER() OVER (
                    PARTITION BY category_id
                    ORDER BY product_id
                ) - 1 AS idx
            FROM product_categories
        )
        UPDATE product_categories AS pc
        SET sort_index = ranked.idx
        FROM ranked
        WHERE pc.product_id = ranked.product_id
          AND pc.category_id = ranked.category_id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_product_categories_category_sort", table_name="product_categories")
    op.drop_column("product_categories", "sort_index")

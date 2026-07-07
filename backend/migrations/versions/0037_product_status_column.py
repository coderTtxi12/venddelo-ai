"""product status column

Revision ID: 0037_product_status
Revises: 0036_menu_import_sessions
Create Date: 2026-07-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0037_product_status"
down_revision: str | None = "0036_menu_import_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
    )
    op.execute(
        """
        UPDATE products
        SET status = CASE
            WHEN is_published = true AND approval_status = 'approved' AND is_active = true
                THEN 'active'
            WHEN is_published = true AND approval_status = 'approved' AND is_active = false
                THEN 'inactive'
            ELSE 'draft'
        END
        """
    )
    op.drop_constraint(op.f("ck_products_approval_status_allowed"), "products", type_="check")
    op.drop_index("ix_products_publish", table_name="products")
    op.drop_index("ix_products_review", table_name="products")
    op.drop_column("products", "approval_status")
    op.drop_column("products", "is_published")
    op.drop_column("products", "is_active")
    op.drop_column("products", "deleted_at")
    op.create_check_constraint(
        op.f("ck_products_status_allowed"),
        "products",
        "status IN ('active','inactive','draft')",
    )
    op.create_index("ix_products_status", "products", ["restaurant_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_products_status", table_name="products")
    op.drop_constraint(op.f("ck_products_status_allowed"), "products", type_="check")
    op.add_column(
        "products",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "products",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "products",
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "products",
        sa.Column("approval_status", sa.String(), nullable=False, server_default="draft"),
    )
    op.execute(
        """
        UPDATE products
        SET
            is_published = status IN ('active', 'inactive'),
            approval_status = CASE WHEN status IN ('active', 'inactive') THEN 'approved' ELSE 'draft' END,
            is_active = status = 'active',
            deleted_at = CASE WHEN status = 'inactive' THEN NOW() ELSE NULL END
        """
    )
    op.create_check_constraint(
        op.f("ck_products_approval_status_allowed"),
        "products",
        "approval_status IN ('draft','pending_review','approved','rejected')",
    )
    op.create_index(
        "ix_products_publish",
        "products",
        ["restaurant_id", "is_active", "is_published"],
        unique=False,
    )
    op.create_index(
        "ix_products_review",
        "products",
        ["restaurant_id", "approval_status"],
        unique=False,
    )
    op.drop_column("products", "status")

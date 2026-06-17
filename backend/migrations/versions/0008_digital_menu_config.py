"""digital menu: cover photo and category display layout

Revision ID: 0008_digital_menu_config
Revises: 0007_currency_mxn
Create Date: 2026-06-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_digital_menu_config"
down_revision: str | None = "0007_currency_mxn"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("restaurants", sa.Column("cover_path", sa.Text(), nullable=True))
    op.add_column(
        "categories",
        sa.Column("display_layout", sa.String(length=20), nullable=True),
    )
    op.create_check_constraint(
        "ck_categories_display_layout_allowed",
        "categories",
        "display_layout IS NULL OR display_layout IN ('vertical','horizontal','grid')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_categories_display_layout_allowed", "categories", type_="check")
    op.drop_column("categories", "display_layout")
    op.drop_column("restaurants", "cover_path")

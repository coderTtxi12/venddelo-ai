"""digital menu special categories config

Revision ID: 0016_dm_special_cats
Revises: 0015_promo_image
Create Date: 2026-06-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016_dm_special_cats"
down_revision: str | None = "0015_promo_image"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurants",
        sa.Column(
            "digital_menu_promotions_category_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "restaurants",
        sa.Column(
            "digital_menu_promotions_category_name",
            sa.Text(),
            nullable=False,
            server_default="Promociones",
        ),
    )
    op.add_column(
        "restaurants",
        sa.Column(
            "digital_menu_limited_time_category_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "restaurants",
        sa.Column(
            "digital_menu_limited_time_category_name",
            sa.Text(),
            nullable=False,
            server_default="Por tiempo limitado",
        ),
    )


def downgrade() -> None:
    op.drop_column("restaurants", "digital_menu_limited_time_category_name")
    op.drop_column("restaurants", "digital_menu_limited_time_category_enabled")
    op.drop_column("restaurants", "digital_menu_promotions_category_name")
    op.drop_column("restaurants", "digital_menu_promotions_category_enabled")

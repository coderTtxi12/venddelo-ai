"""restaurants: live menu social links

Revision ID: 0047_restaurant_live_menu_social_links
Revises: 0046_digital_menu_theme_colors_typography
Create Date: 2026-07-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0047_restaurant_live_menu_social_links"
down_revision: str | None = "0046_digital_menu_theme_colors_typography"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurants",
        sa.Column(
            "live_menu_social_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "restaurants",
        sa.Column("facebook_url", sa.Text(), nullable=True),
    )
    op.add_column(
        "restaurants",
        sa.Column("instagram_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("restaurants", "instagram_url")
    op.drop_column("restaurants", "facebook_url")
    op.drop_column("restaurants", "live_menu_social_enabled")

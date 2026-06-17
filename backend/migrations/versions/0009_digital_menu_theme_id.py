"""restaurants: persist digital menu theme id

Revision ID: 0009_digital_menu_theme_id
Revises: 0008_digital_menu_config
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_digital_menu_theme_id"
down_revision: str | None = "0008_digital_menu_config"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurants",
        sa.Column(
            "digital_menu_theme_id",
            sa.String(length=64),
            nullable=False,
            server_default="original",
        ),
    )


def downgrade() -> None:
    op.drop_column("restaurants", "digital_menu_theme_id")

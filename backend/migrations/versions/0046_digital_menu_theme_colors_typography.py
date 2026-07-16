"""digital_menu_themes: colors and typography JSONB

Revision ID: 0046_digital_menu_theme_colors_typography
Revises: 0045_restaurant_branch_count
Create Date: 2026-07-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0046_digital_menu_theme_colors_typography"
down_revision: str | None = "0045_restaurant_branch_count"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "digital_menu_themes",
        sa.Column(
            "colors",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "digital_menu_themes",
        sa.Column(
            "typography",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("digital_menu_themes", "typography")
    op.drop_column("digital_menu_themes", "colors")

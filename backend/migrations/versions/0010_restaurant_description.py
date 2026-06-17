"""restaurants: add description

Revision ID: 0010_restaurant_description
Revises: 0009_digital_menu_theme_id
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_restaurant_description"
down_revision: str | None = "0009_digital_menu_theme_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("restaurants", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("restaurants", "description")

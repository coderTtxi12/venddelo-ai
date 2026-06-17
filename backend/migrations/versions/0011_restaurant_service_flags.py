"""restaurants: add takeout_enabled and delivery_enabled

Revision ID: 0011_restaurant_service_flags
Revises: 0010_restaurant_description
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_restaurant_service_flags"
down_revision: str | None = "0010_restaurant_description"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurants",
        sa.Column("takeout_enabled", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "restaurants",
        sa.Column("delivery_enabled", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("restaurants", "delivery_enabled")
    op.drop_column("restaurants", "takeout_enabled")

"""add owner_id to restaurants

Revision ID: 0002_add_owner_id
Revises: 0001_baseline
Create Date: 2026-06-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_add_owner_id"
down_revision: str | None = "0001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurants",
        sa.Column("owner_id", sa.UUID(), nullable=True),
    )
    op.create_index("ix_restaurants_owner_id", "restaurants", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_restaurants_owner_id", table_name="restaurants")
    op.drop_column("restaurants", "owner_id")

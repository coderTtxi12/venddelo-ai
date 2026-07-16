"""restaurants: add nullable branch_count from onboarding

Revision ID: 0045_restaurant_branch_count
Revises: 0044_multi_restaurant_admin_access
Create Date: 2026-07-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0045_restaurant_branch_count"
down_revision: str | None = "0044_multi_restaurant_admin_access"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurants",
        sa.Column("branch_count", sa.SmallInteger(), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_restaurants_branch_count_range"),
        "restaurants",
        "branch_count IS NULL OR (branch_count >= 1 AND branch_count <= 999)",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_restaurants_branch_count_range"),
        "restaurants",
        type_="check",
    )
    op.drop_column("restaurants", "branch_count")

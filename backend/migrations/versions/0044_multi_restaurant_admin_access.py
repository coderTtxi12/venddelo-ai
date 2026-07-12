"""allow admins on multiple restaurants and track last access

Revision ID: 0044_multi_restaurant_admin_access
Revises: 0043_fix_restaurant_member_primary
Create Date: 2026-07-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0044_multi_restaurant_admin_access"
down_revision: str | None = "0043_fix_restaurant_member_primary"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        op.f("uq_restaurant_members_user_id"),
        "restaurant_members",
        type_="unique",
    )
    op.add_column(
        "restaurant_members",
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "uq_restaurant_members_one_owner_per_user",
        "restaurant_members",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("member_role = 'owner' AND is_active = true"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_restaurant_members_one_owner_per_user",
        table_name="restaurant_members",
        postgresql_where=sa.text("member_role = 'owner' AND is_active = true"),
    )
    op.drop_column("restaurant_members", "last_accessed_at")
    op.create_unique_constraint(
        op.f("uq_restaurant_members_user_id"),
        "restaurant_members",
        ["user_id"],
    )

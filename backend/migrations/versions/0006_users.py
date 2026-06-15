"""add users table and link restaurants.owner_id

Revision ID: 0006_users
Revises: 0005_ai_jobs_id_default
Create Date: 2026-06-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_users"
down_revision: str | None = "0005_ai_jobs_id_default"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("role", sa.String(length=30), server_default="owner", nullable=False),
        sa.Column("plan", sa.String(length=30), server_default="free", nullable=False),
        sa.Column("billing_customer_id", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("role IN ('owner','admin','staff')", name="user_role_allowed"),
        sa.CheckConstraint("plan IN ('free','pro','enterprise')", name="user_plan_allowed"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Backfill users for existing restaurant owners
    op.execute(
        """
        INSERT INTO users (id, email, role, plan)
        SELECT DISTINCT owner_id, NULL, 'owner', 'free'
        FROM restaurants
        WHERE owner_id IS NOT NULL
        ON CONFLICT (id) DO NOTHING
        """
    )

    op.create_foreign_key(
        "fk_restaurants_owner_id_users",
        "restaurants",
        "users",
        ["owner_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_restaurants_owner_id_users", "restaurants", type_="foreignkey")
    op.drop_table("users")

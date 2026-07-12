"""restaurant members and admin invites by email

Revision ID: 0042_restaurant_admin_invites
Revises: 0041_delivery_provider_admin_invites
Create Date: 2026-07-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0042_restaurant_admin_invites"
down_revision: str | None = "0041_delivery_provider_admin_invites"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "restaurant_members",
        sa.Column("restaurant_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("member_role", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
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
        sa.CheckConstraint(
            "member_role IN ('owner','admin')",
            name=op.f("ck_restaurant_members_member_role_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["restaurant_id"],
            ["restaurants.id"],
            name=op.f("fk_restaurant_members_restaurant_id_restaurants"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_restaurant_members_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_restaurant_members")),
        sa.UniqueConstraint(
            "restaurant_id",
            "user_id",
            name=op.f("uq_restaurant_members_restaurant_id_user_id"),
        ),
        sa.UniqueConstraint("user_id", name=op.f("uq_restaurant_members_user_id")),
    )
    op.create_index(
        "ix_restaurant_members_restaurant_id",
        "restaurant_members",
        ["restaurant_id"],
        unique=False,
    )

    op.create_table(
        "restaurant_admin_invites",
        sa.Column("restaurant_id", sa.UUID(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["restaurant_id"],
            ["restaurants.id"],
            name=op.f("fk_restaurant_admin_invites_restaurant_id_restaurants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_restaurant_admin_invites")),
        sa.UniqueConstraint(
            "restaurant_id",
            "email",
            name=op.f("uq_restaurant_admin_invites_restaurant_id_email"),
        ),
        sa.UniqueConstraint("email", name=op.f("uq_restaurant_admin_invites_email")),
    )
    op.create_index(
        "ix_restaurant_admin_invites_email",
        "restaurant_admin_invites",
        ["email"],
        unique=False,
    )

    op.execute(
        """
        INSERT INTO restaurant_members (restaurant_id, user_id, member_role, is_active)
        SELECT id, owner_id, 'owner', true
        FROM restaurants
        WHERE owner_id IS NOT NULL
        ON CONFLICT (user_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_restaurant_admin_invites_email", table_name="restaurant_admin_invites")
    op.drop_table("restaurant_admin_invites")
    op.drop_index("ix_restaurant_members_restaurant_id", table_name="restaurant_members")
    op.drop_table("restaurant_members")

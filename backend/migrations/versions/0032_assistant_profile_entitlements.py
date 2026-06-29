"""assistant profile and entitlements tables

Revision ID: 0032_assistant_profile
Revises: 0031_order_cash_denomination
Create Date: 2026-06-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0032_assistant_profile"
down_revision: str | None = "0031_order_cash_denomination"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "restaurant_assistant_profiles",
        sa.Column("restaurant_id", sa.UUID(), nullable=False),
        sa.Column("display_name", sa.String(length=80), server_default="", nullable=False),
        sa.Column("identity_markdown", sa.Text(), nullable=False),
        sa.Column("behavior_markdown", sa.Text(), nullable=False),
        sa.Column("menu_markdown", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "enabled_skill_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
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
            name=op.f("fk_restaurant_assistant_profiles_restaurant_id_restaurants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("restaurant_id", name=op.f("pk_restaurant_assistant_profiles")),
    )

    op.create_table(
        "restaurant_assistant_entitlements",
        sa.Column("restaurant_id", sa.UUID(), nullable=False),
        sa.Column(
            "granted_extra",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "revoked",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(length=40), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["restaurant_id"],
            ["restaurants.id"],
            name=op.f("fk_restaurant_assistant_entitlements_restaurant_id_restaurants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("restaurant_id", name=op.f("pk_restaurant_assistant_entitlements")),
    )


def downgrade() -> None:
    op.drop_table("restaurant_assistant_entitlements")
    op.drop_table("restaurant_assistant_profiles")

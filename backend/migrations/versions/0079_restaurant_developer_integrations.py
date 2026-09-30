"""restaurant developer webhooks and api keys

Revision ID: 0079_restaurant_developer_integrations
Revises: 0078_dispatch_accepted_status
Create Date: 2026-09-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0079_restaurant_developer_integrations"
down_revision: str | None = "0078_dispatch_accepted_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "restaurant_tracking_webhooks",
        sa.Column("restaurant_id", sa.UUID(), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("signing_secret", sa.Text(), nullable=True),
        sa.Column("secret_hint", sa.String(length=12), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notify_status", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("notify_location", sa.Boolean(), server_default="true", nullable=False),
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
            name=op.f("fk_restaurant_tracking_webhooks_restaurant_id_restaurants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("restaurant_id", name=op.f("pk_restaurant_tracking_webhooks")),
    )
    op.create_table(
        "restaurant_developer_api_keys",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("restaurant_id", sa.UUID(), nullable=False),
        sa.Column("label", sa.String(length=64), nullable=False),
        sa.Column("key_prefix", sa.String(length=24), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["restaurant_id"],
            ["restaurants.id"],
            name=op.f("fk_restaurant_developer_api_keys_restaurant_id_restaurants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_restaurant_developer_api_keys")),
    )
    op.create_index(
        op.f("ix_restaurant_developer_api_keys_restaurant_id"),
        "restaurant_developer_api_keys",
        ["restaurant_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_restaurant_developer_api_keys_restaurant_id"),
        table_name="restaurant_developer_api_keys",
    )
    op.drop_table("restaurant_developer_api_keys")
    op.drop_table("restaurant_tracking_webhooks")

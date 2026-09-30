"""webhook test sink token per restaurant

Revision ID: 0080_webhook_sink_token
Revises: 0079_restaurant_developer_integrations
Create Date: 2026-09-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0080_webhook_sink_token"
down_revision: str | None = "0079_restaurant_developer_integrations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurant_tracking_webhooks",
        sa.Column("sink_token", sa.String(length=48), nullable=True),
    )
    op.execute(
        """
        UPDATE restaurant_tracking_webhooks
        SET sink_token = substr(
            replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
            1,
            48
        )
        WHERE sink_token IS NULL
        """
    )
    op.alter_column("restaurant_tracking_webhooks", "sink_token", nullable=False)
    op.create_index(
        op.f("ix_restaurant_tracking_webhooks_sink_token"),
        "restaurant_tracking_webhooks",
        ["sink_token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_restaurant_tracking_webhooks_sink_token"),
        table_name="restaurant_tracking_webhooks",
    )
    op.drop_column("restaurant_tracking_webhooks", "sink_token")

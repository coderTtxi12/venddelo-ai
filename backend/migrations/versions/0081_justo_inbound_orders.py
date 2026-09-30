"""justo store map and external order identity

Revision ID: 0081_justo_inbound_orders
Revises: 0080_webhook_sink_token
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0081_justo_inbound_orders"
down_revision: str | None = "0080_webhook_sink_token"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "restaurant_justo_stores",
        sa.Column("restaurant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", sa.String(length=80), nullable=False),
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
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("restaurant_id"),
        sa.UniqueConstraint("store_id"),
    )
    op.add_column("orders", sa.Column("external_source", sa.String(length=32), nullable=True))
    op.add_column("orders", sa.Column("external_id", sa.Text(), nullable=True))
    op.create_index(
        "uq_orders_external",
        "orders",
        ["restaurant_id", "external_source", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_orders_external", table_name="orders")
    op.drop_column("orders", "external_id")
    op.drop_column("orders", "external_source")
    op.drop_table("restaurant_justo_stores")

"""store raw justo webhook payloads

Revision ID: 0083_justo_webhook_receipts
Revises: 0082_justo_signing_secret
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0083_justo_webhook_receipts"
down_revision: str | None = "0082_justo_signing_secret"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "justo_webhook_receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("restaurant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("result", sa.String(length=32), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_justo_webhook_receipts_restaurant_id",
        "justo_webhook_receipts",
        ["restaurant_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_justo_webhook_receipts_restaurant_id", table_name="justo_webhook_receipts")
    op.drop_table("justo_webhook_receipts")

"""order cash denomination for delivery cash payments

Revision ID: 0031_order_cash_denomination
Revises: 0030_assistant_conversations
Create Date: 2026-06-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0031_order_cash_denomination"
down_revision: str | None = "0030_assistant_conversations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("cash_denomination_cents", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "cash_denomination_cents")

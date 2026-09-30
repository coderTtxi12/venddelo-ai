"""justo webhook signing secret

Revision ID: 0082_justo_signing_secret
Revises: 0081_justo_inbound_orders
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0082_justo_signing_secret"
down_revision: str | None = "0081_justo_inbound_orders"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("restaurant_justo_stores", "store_id", existing_type=sa.String(length=80), nullable=True)
    op.add_column("restaurant_justo_stores", sa.Column("signing_secret", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("restaurant_justo_stores", "signing_secret")
    op.alter_column("restaurant_justo_stores", "store_id", existing_type=sa.String(length=80), nullable=False)

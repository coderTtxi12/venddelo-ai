"""default product currency MXN

Revision ID: 0007_currency_mxn
Revises: 0006_users
Create Date: 2026-06-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_currency_mxn"
down_revision: str | None = "0006_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "products",
        "currency",
        server_default="MXN",
        existing_type=sa.String(length=3),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "products",
        "currency",
        server_default="USD",
        existing_type=sa.String(length=3),
        existing_nullable=False,
    )

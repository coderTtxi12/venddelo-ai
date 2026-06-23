"""restaurants: owner contact name and phone

Revision ID: 0025_restaurant_owner_contact
Revises: 0024_delivery_payment_methods
Create Date: 2026-06-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025_restaurant_owner_contact"
down_revision: str | None = "0024_delivery_payment_methods"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("restaurants", sa.Column("owner_contact_name", sa.Text(), nullable=True))
    op.add_column(
        "restaurants",
        sa.Column("owner_phone", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("restaurants", "owner_phone")
    op.drop_column("restaurants", "owner_contact_name")

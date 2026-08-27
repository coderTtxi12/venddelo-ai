"""store rider app version for assignment gating

Revision ID: 0066_driver_app_client
Revises: 0065_restaurant_ticket_print
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0066_driver_app_client"
down_revision: str | None = "0065_restaurant_ticket_print"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("delivery_drivers", sa.Column("app_version", sa.Text(), nullable=True))
    op.add_column("delivery_drivers", sa.Column("app_build_number", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("delivery_drivers", "app_build_number")
    op.drop_column("delivery_drivers", "app_version")

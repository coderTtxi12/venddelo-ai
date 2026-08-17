"""delivery drivers: emergency contact

Revision ID: 0054_driver_emergency_contact
Revises: 0053_driver_registered_zone
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0054_driver_emergency_contact"
down_revision: str | None = "0053_driver_registered_zone"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "delivery_drivers",
        sa.Column("emergency_contact_name", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "delivery_drivers",
        sa.Column("emergency_contact_phone", sa.Text(), nullable=False, server_default=""),
    )
    op.alter_column("delivery_drivers", "emergency_contact_name", server_default=None)
    op.alter_column("delivery_drivers", "emergency_contact_phone", server_default=None)


def downgrade() -> None:
    op.drop_column("delivery_drivers", "emergency_contact_phone")
    op.drop_column("delivery_drivers", "emergency_contact_name")

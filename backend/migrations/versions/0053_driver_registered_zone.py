"""delivery drivers: informational registered company zone

Revision ID: 0053_driver_registered_zone
Revises: 0052_delivery_dispatch
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0053_driver_registered_zone"
down_revision: str | None = "0052_delivery_dispatch"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "delivery_drivers",
        sa.Column("registered_zone_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_delivery_drivers_registered_zone_id_delivery_provider_zones"),
        "delivery_drivers",
        "delivery_provider_zones",
        ["registered_zone_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_delivery_drivers_registered_zone_id_delivery_provider_zones"),
        "delivery_drivers",
        type_="foreignkey",
    )
    op.drop_column("delivery_drivers", "registered_zone_id")

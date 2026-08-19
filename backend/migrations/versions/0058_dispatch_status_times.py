"""store pickup transit and delivered times

Revision ID: 0058_dispatch_status_times
Revises: 0057_driver_itinerary
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0058_dispatch_status_times"
down_revision: str | None = "0057_driver_itinerary"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "delivery_dispatch_requests",
        sa.Column("picked_up_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "delivery_dispatch_requests",
        sa.Column("in_transit_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "delivery_dispatch_requests",
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("delivery_dispatch_requests", "delivered_at")
    op.drop_column("delivery_dispatch_requests", "in_transit_at")
    op.drop_column("delivery_dispatch_requests", "picked_up_at")

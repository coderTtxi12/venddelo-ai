"""add driver itinerary stops

Revision ID: 0057_driver_itinerary
Revises: 0056_dispatch_short_id
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0057_driver_itinerary"
down_revision: str | None = "0056_dispatch_short_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "delivery_driver_itinerary_stops",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("driver_id", sa.UUID(), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.CheckConstraint("kind IN ('restaurant','dropoff')", name="kind_allowed"),
        sa.ForeignKeyConstraint(["driver_id"], ["delivery_drivers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["request_id"], ["delivery_dispatch_requests.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("driver_id", "sequence", name="uq_driver_itinerary_sequence"),
        sa.UniqueConstraint("driver_id", "request_id", "kind", name="uq_driver_itinerary_stop"),
    )
    op.create_index(
        "ix_delivery_driver_itinerary_driver",
        "delivery_driver_itinerary_stops",
        ["driver_id", "sequence"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_delivery_driver_itinerary_driver",
        table_name="delivery_driver_itinerary_stops",
    )
    op.drop_table("delivery_driver_itinerary_stops")

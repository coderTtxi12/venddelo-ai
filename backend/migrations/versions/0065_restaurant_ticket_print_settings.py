"""per-restaurant kitchen ticket print layout

Revision ID: 0065_restaurant_ticket_print
Revises: 0064_order_kds_cleared_at
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0065_restaurant_ticket_print"
down_revision: str | None = "0064_order_kds_cleared_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurants",
        sa.Column(
            "ticket_print_settings",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("restaurants", "ticket_print_settings")

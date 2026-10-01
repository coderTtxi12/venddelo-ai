"""product menu visibility schedule

Revision ID: 0084_product_menu_schedule
Revises: 0083_justo_webhook_receipts
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0084_product_menu_schedule"
down_revision: str | None = "0083_justo_webhook_receipts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("menu_schedule_weekdays", postgresql.ARRAY(sa.SmallInteger()), nullable=True),
    )
    op.add_column(
        "products",
        sa.Column("menu_schedule_start_time", sa.Time(), nullable=True),
    )
    op.add_column(
        "products",
        sa.Column("menu_schedule_end_time", sa.Time(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("products", "menu_schedule_end_time")
    op.drop_column("products", "menu_schedule_start_time")
    op.drop_column("products", "menu_schedule_weekdays")

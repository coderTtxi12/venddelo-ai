"""add partnership on_hold flag

Revision ID: 0077_partnership_on_hold
Revises: 0076_partnership_web_app
Create Date: 2026-09-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0077_partnership_on_hold"
down_revision: str | None = "0076_partnership_web_app"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurant_delivery_providers",
        sa.Column(
            "on_hold",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("restaurant_delivery_providers", "on_hold")

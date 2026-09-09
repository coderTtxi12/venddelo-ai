"""add partnership web app indicator

Revision ID: 0076_partnership_web_app
Revises: 0075_mexy_fee_holds
Create Date: 2026-09-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0076_partnership_web_app"
down_revision: str | None = "0075_mexy_fee_holds"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurant_delivery_providers",
        sa.Column(
            "has_web_app",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("restaurant_delivery_providers", "has_web_app")

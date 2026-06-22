"""delivery provider manual service toggle

Revision ID: 0020_delivery_service_status
Revises: 0019_delivery_schedule_kind
Create Date: 2026-06-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020_delivery_service_status"
down_revision: str | None = "0019_delivery_schedule_kind"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "delivery_providers",
        sa.Column(
            "service_manually_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("delivery_providers", "service_manually_enabled")

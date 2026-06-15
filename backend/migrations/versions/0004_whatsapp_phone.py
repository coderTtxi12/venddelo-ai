"""add whatsapp_phone to restaurants

Revision ID: 0004_whatsapp_phone
Revises: 0003_ai_jobs
Create Date: 2026-06-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_whatsapp_phone"
down_revision: str | None = "0003_ai_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurants",
        sa.Column("whatsapp_phone", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("restaurants", "whatsapp_phone")

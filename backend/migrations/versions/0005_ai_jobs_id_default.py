"""add gen_random_uuid default to ai_jobs.id

Revision ID: 0005_ai_jobs_id_default
Revises: 0004_whatsapp_phone
Create Date: 2026-06-15
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005_ai_jobs_id_default"
down_revision: str | None = "0004_whatsapp_phone"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE ai_jobs ALTER COLUMN id SET DEFAULT gen_random_uuid()")


def downgrade() -> None:
    op.execute("ALTER TABLE ai_jobs ALTER COLUMN id DROP DEFAULT")

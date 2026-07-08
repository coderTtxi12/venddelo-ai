"""menu import session live menu snapshots

Revision ID: 0038_menu_import_snapshots
Revises: 0037_product_status
Create Date: 2026-07-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0038_menu_import_snapshots"
down_revision: str | None = "0037_product_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "assistant_menu_import_sessions",
        sa.Column(
            "live_menu_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "assistant_menu_import_sessions",
        sa.Column(
            "reconciliation_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("assistant_menu_import_sessions", "reconciliation_snapshot")
    op.drop_column("assistant_menu_import_sessions", "live_menu_snapshot")

"""digital menu themes catalog table

Revision ID: 0035_digital_menu_themes
Revises: 0034_entitlements_per_restaurant
Create Date: 2026-07-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0035_digital_menu_themes"
down_revision: str | None = "0034_entitlements_per_restaurant"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64)"))
    op.create_table(
        "digital_menu_themes",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "best_for",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("recommendation", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "style_keywords",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_digital_menu_themes")),
    )


def downgrade() -> None:
    op.drop_table("digital_menu_themes")

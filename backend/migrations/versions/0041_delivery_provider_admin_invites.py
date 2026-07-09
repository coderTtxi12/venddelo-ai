"""delivery provider admin invites by email

Revision ID: 0041_delivery_provider_admin_invites
Revises: 0040_menu_import_ocr_snapshots
Create Date: 2026-07-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0041_delivery_provider_admin_invites"
down_revision: str | None = "0040_menu_import_ocr_snapshots"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "delivery_provider_admin_invites",
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["delivery_provider_id"],
            ["delivery_providers.id"],
            name=op.f("fk_delivery_provider_admin_invites_delivery_provider_id_delivery_providers"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_provider_admin_invites")),
        sa.UniqueConstraint(
            "delivery_provider_id",
            "email",
            name=op.f("uq_delivery_provider_admin_invites_delivery_provider_id_email"),
        ),
    )
    op.create_index(
        "ix_delivery_provider_admin_invites_email",
        "delivery_provider_admin_invites",
        ["email"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_delivery_provider_admin_invites_email",
        table_name="delivery_provider_admin_invites",
    )
    op.drop_table("delivery_provider_admin_invites")

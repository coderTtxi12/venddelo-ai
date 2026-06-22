"""delivery provider onboarding fields and review statuses

Revision ID: 0018_delivery_onboarding
Revises: 0017_delivery_providers
Create Date: 2026-06-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_delivery_onboarding"
down_revision: str | None = "0017_delivery_providers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("delivery_providers", sa.Column("responsible_name", sa.Text(), nullable=True))
    op.add_column(
        "delivery_providers",
        sa.Column("responsible_phone", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "delivery_providers",
        sa.Column("whatsapp_phone", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "delivery_providers",
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.drop_constraint(
        op.f("ck_delivery_providers_status_allowed"),
        "delivery_providers",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_delivery_providers_status_allowed"),
        "delivery_providers",
        "status IN ('draft','pending_review','active','rejected','suspended')",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_delivery_providers_status_allowed"),
        "delivery_providers",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_delivery_providers_status_allowed"),
        "delivery_providers",
        "status IN ('draft','active','suspended')",
    )

    op.drop_column("delivery_providers", "submitted_at")
    op.drop_column("delivery_providers", "whatsapp_phone")
    op.drop_column("delivery_providers", "responsible_phone")
    op.drop_column("delivery_providers", "responsible_name")

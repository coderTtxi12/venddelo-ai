"""promotion bundle pairing mode

Revision ID: 0014_bundle_pairing
Revises: 0013_promotions_engine
Create Date: 2026-06-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_bundle_pairing"
down_revision: str | None = "0013_promotions_engine"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "promotions",
        sa.Column(
            "bundle_pairing_mode",
            sa.String(length=32),
            nullable=False,
            server_default="cross_product",
        ),
    )
    op.create_check_constraint(
        "promotion_bundle_pairing_mode_allowed",
        "promotions",
        "bundle_pairing_mode IN ('cross_product','same_product')",
    )


def downgrade() -> None:
    op.drop_constraint("promotion_bundle_pairing_mode_allowed", "promotions", type_="check")
    op.drop_column("promotions", "bundle_pairing_mode")

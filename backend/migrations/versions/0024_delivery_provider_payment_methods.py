"""delivery provider payment methods

Revision ID: 0024_delivery_payment_methods
Revises: 0023_mexy_provider_seed
Create Date: 2026-06-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024_delivery_payment_methods"
down_revision: str | None = "0023_mexy_provider_seed"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "delivery_provider_payment_methods",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
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
        sa.CheckConstraint(
            "method IN ('cash','transfer','card_terminal')",
            name="delivery_payment_method_allowed",
        ),
        sa.ForeignKeyConstraint(
            ["delivery_provider_id"],
            ["delivery_providers.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "delivery_provider_id",
            "method",
            name="uq_delivery_provider_payment_method",
        ),
    )
    op.create_index(
        "ix_delivery_provider_payment_methods_lookup",
        "delivery_provider_payment_methods",
        ["delivery_provider_id"],
    )

    op.execute(
        """
        INSERT INTO delivery_provider_payment_methods (
            id, delivery_provider_id, method, enabled, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            dp.id,
            m.method,
            true,
            now(),
            now()
        FROM delivery_providers dp
        CROSS JOIN (
            VALUES ('cash'), ('transfer'), ('card_terminal')
        ) AS m(method)
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_delivery_provider_payment_methods_lookup",
        table_name="delivery_provider_payment_methods",
    )
    op.drop_table("delivery_provider_payment_methods")

"""delivery provider pricing config + weather mode

Revision ID: 0021_delivery_pricing
Revises: 0020_delivery_service_status
Create Date: 2026-06-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0021_delivery_pricing"
down_revision: str | None = "0020_delivery_service_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "delivery_providers",
        sa.Column(
            "weather_mode",
            sa.String(length=16),
            nullable=False,
            server_default="none",
        ),
    )
    op.create_check_constraint(
        "weather_mode_allowed",
        "delivery_providers",
        "weather_mode IN ('none', 'light', 'heavy', 'intense')",
    )

    op.create_table(
        "delivery_provider_pricing_configs",
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column("inside_polygon", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("outside_polygon", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
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
            name=op.f(
                "fk_delivery_provider_pricing_configs_delivery_provider_id_delivery_providers"
            ),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_provider_pricing_configs")),
        sa.UniqueConstraint(
            "delivery_provider_id",
            name=op.f("uq_delivery_provider_pricing_configs_delivery_provider_id"),
        ),
    )


def downgrade() -> None:
    op.drop_table("delivery_provider_pricing_configs")
    op.drop_constraint("weather_mode_allowed", "delivery_providers", type_="check")
    op.drop_column("delivery_providers", "weather_mode")

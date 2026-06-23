"""seed Mexy Reparto platform delivery provider

Revision ID: 0023_mexy_provider_seed
Revises: 0022_mexy_partnership_backfill
Create Date: 2026-06-22
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0023_mexy_provider_seed"
down_revision: str | None = "0022_mexy_partnership_backfill"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO delivery_providers (
            id,
            name,
            legal_name,
            slug,
            status,
            timezone,
            service_manually_enabled,
            weather_mode,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            'Mexy Reparto',
            'Mexy Reparto',
            'mexy-reparto',
            'active',
            'America/Mexico_City',
            true,
            'none',
            NOW(),
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM delivery_providers WHERE slug = 'mexy-reparto'
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM delivery_providers
        WHERE slug = 'mexy-reparto'
          AND NOT EXISTS (
              SELECT 1 FROM delivery_provider_members
              WHERE delivery_provider_id = delivery_providers.id
          )
        """
    )

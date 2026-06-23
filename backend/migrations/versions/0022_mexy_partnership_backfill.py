"""backfill Mexy partnership requests for restaurants with delivery enabled

Revision ID: 0022_mexy_partnership_backfill
Revises: 0021_delivery_pricing
Create Date: 2026-06-22
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0022_mexy_partnership_backfill"
down_revision: str | None = "0021_delivery_pricing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO restaurant_delivery_providers (
            id,
            restaurant_id,
            delivery_provider_id,
            status,
            is_default,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            r.id,
            dp.id,
            'pending',
            false,
            NOW(),
            NOW()
        FROM restaurants r
        CROSS JOIN LATERAL (
            SELECT id
            FROM delivery_providers
            WHERE slug LIKE 'mexy-reparto%'
            ORDER BY created_at ASC
            LIMIT 1
        ) dp
        WHERE r.delivery_enabled = true
          AND r.is_active = true
          AND NOT EXISTS (
              SELECT 1
              FROM restaurant_delivery_providers rdp
              WHERE rdp.restaurant_id = r.id
                AND rdp.delivery_provider_id = dp.id
          )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM restaurant_delivery_providers rdp
        USING delivery_providers dp
        WHERE rdp.delivery_provider_id = dp.id
          AND dp.slug LIKE 'mexy-reparto%'
          AND rdp.status = 'pending'
          AND rdp.activated_at IS NULL
        """
    )

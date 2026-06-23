"""dedupe pending Mexy partnership requests per restaurant

Revision ID: 0027_dedupe_mexy_partnerships
Revises: 0026_backfill_owner_phone
Create Date: 2026-06-23
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0027_dedupe_mexy_partnerships"
down_revision: str | None = "0026_backfill_owner_phone"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        WITH mexy_providers AS (
            SELECT id
            FROM delivery_providers
            WHERE slug = 'mexy'
               OR slug = 'mexy-reparto'
               OR slug LIKE 'mexy-reparto%'
        ),
        ranked_pending AS (
            SELECT
                rdp.id,
                ROW_NUMBER() OVER (
                    PARTITION BY rdp.restaurant_id
                    ORDER BY rdp.created_at DESC, rdp.id DESC
                ) AS rn
            FROM restaurant_delivery_providers rdp
            JOIN mexy_providers mp ON mp.id = rdp.delivery_provider_id
            WHERE rdp.status = 'pending'
        )
        DELETE FROM restaurant_delivery_providers rdp
        USING ranked_pending rp
        WHERE rdp.id = rp.id
          AND rp.rn > 1
        """
    )

    op.execute(
        """
        WITH mexy_providers AS (
            SELECT id
            FROM delivery_providers
            WHERE slug = 'mexy'
               OR slug = 'mexy-reparto'
               OR slug LIKE 'mexy-reparto%'
        ),
        ranked_active AS (
            SELECT
                rdp.id,
                ROW_NUMBER() OVER (
                    PARTITION BY rdp.restaurant_id
                    ORDER BY rdp.activated_at DESC NULLS LAST, rdp.created_at DESC, rdp.id DESC
                ) AS rn
            FROM restaurant_delivery_providers rdp
            JOIN mexy_providers mp ON mp.id = rdp.delivery_provider_id
            WHERE rdp.status = 'active'
              AND rdp.is_default = true
        )
        UPDATE restaurant_delivery_providers rdp
        SET is_default = false,
            status = 'suspended'
        FROM ranked_active ra
        WHERE rdp.id = ra.id
          AND ra.rn > 1
        """
    )


def downgrade() -> None:
    pass

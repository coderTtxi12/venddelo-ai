"""entitlements per restaurant (no billing plan)

Revision ID: 0034_entitlements_per_restaurant
Revises: 0033_assistant_usage
Create Date: 2026-06-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0034_entitlements_per_restaurant"
down_revision: str | None = "0033_assistant_usage"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "restaurant_assistant_entitlements",
        "granted_extra",
        new_column_name="granted_skill_ids",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=False,
        existing_server_default=sa.text("'[]'::jsonb"),
    )
    op.drop_column("restaurant_assistant_entitlements", "revoked")

    op.execute(
        """
        UPDATE restaurant_assistant_entitlements AS e
        SET granted_skill_ids = COALESCE(
            NULLIF(p.enabled_skill_ids, '[]'::jsonb),
            '["menu_read"]'::jsonb
        )
        FROM restaurant_assistant_profiles AS p
        WHERE e.restaurant_id = p.restaurant_id
          AND (e.granted_skill_ids IS NULL OR e.granted_skill_ids = '[]'::jsonb)
        """
    )

    op.execute(
        """
        INSERT INTO restaurant_assistant_entitlements (restaurant_id, granted_skill_ids, source)
        SELECT
            p.restaurant_id,
            COALESCE(NULLIF(p.enabled_skill_ids, '[]'::jsonb), '["menu_read"]'::jsonb),
            'migration'
        FROM restaurant_assistant_profiles AS p
        WHERE NOT EXISTS (
            SELECT 1
            FROM restaurant_assistant_entitlements AS e
            WHERE e.restaurant_id = p.restaurant_id
        )
        """
    )


def downgrade() -> None:
    op.add_column(
        "restaurant_assistant_entitlements",
        sa.Column(
            "revoked",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.alter_column(
        "restaurant_assistant_entitlements",
        "granted_skill_ids",
        new_column_name="granted_extra",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=False,
        existing_server_default=sa.text("'[]'::jsonb"),
    )

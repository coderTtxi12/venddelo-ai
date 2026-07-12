"""move restaurant members to each owner's primary restaurant

Revision ID: 0043_fix_restaurant_member_primary
Revises: 0042_restaurant_admin_invites
Create Date: 2026-07-12

restaurant_members.user_id is globally unique, so the 0042 backfill could attach
the owner (and later invited admins) to a newer draft duplicate instead of the
oldest restaurant for that owner_id. Re-point active memberships to the primary.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0043_fix_restaurant_member_primary"
down_revision: str | None = "0042_restaurant_admin_invites"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        WITH primary_restaurants AS (
            SELECT DISTINCT ON (owner_id)
                id AS restaurant_id,
                owner_id
            FROM restaurants
            WHERE owner_id IS NOT NULL
              AND is_active = true
            ORDER BY owner_id, created_at ASC, id ASC
        )
        UPDATE restaurant_members AS m
        SET restaurant_id = pr.restaurant_id,
            updated_at = now()
        FROM restaurants AS r
        JOIN primary_restaurants AS pr ON pr.owner_id = r.owner_id
        WHERE m.restaurant_id = r.id
          AND m.is_active = true
          AND r.id <> pr.restaurant_id
          AND NOT EXISTS (
              SELECT 1
              FROM restaurant_members existing
              WHERE existing.restaurant_id = pr.restaurant_id
                AND existing.user_id = m.user_id
          )
        """
    )


def downgrade() -> None:
    # Data repair; irreversible.
    pass

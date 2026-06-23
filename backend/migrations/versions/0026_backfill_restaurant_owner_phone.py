"""backfill restaurant owner_phone from whatsapp when missing

Revision ID: 0026_backfill_owner_phone
Revises: 0025_restaurant_owner_contact
Create Date: 2026-06-22
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0026_backfill_owner_phone"
down_revision: str | None = "0025_restaurant_owner_contact"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE restaurants
        SET owner_phone = whatsapp_phone
        WHERE owner_phone IS NULL
          AND whatsapp_phone IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE restaurants r
        SET owner_contact_name = u.display_name
        FROM users u
        WHERE r.owner_id = u.id
          AND r.owner_contact_name IS NULL
          AND u.display_name IS NOT NULL
          AND btrim(u.display_name) <> ''
        """
    )


def downgrade() -> None:
    pass

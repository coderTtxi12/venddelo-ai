"""restaurants: per-network social toggles and placement

Revision ID: 0048_restaurant_live_menu_social_controls
Revises: 0047_restaurant_live_menu_social_links
Create Date: 2026-07-20

Note: needs a short exclusive lock on restaurants. Stop the API before running
on Supabase, or the ADD COLUMN waits for locks and hits statement_timeout.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0048_restaurant_live_menu_social_controls"
down_revision: str | None = "0047_restaurant_live_menu_social_links"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Supabase default statement_timeout is short; wait for locks a bit longer,
    # but fail clearly if something still holds restaurants (usually the API).
    op.execute("SET LOCAL statement_timeout = '120s'")
    op.execute("SET LOCAL lock_timeout = '60s'")

    op.add_column(
        "restaurants",
        sa.Column(
            "live_menu_social_facebook_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "restaurants",
        sa.Column(
            "live_menu_social_instagram_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "restaurants",
        sa.Column(
            "live_menu_social_whatsapp_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "restaurants",
        sa.Column(
            "live_menu_social_placement",
            sa.String(32),
            nullable=False,
            server_default="footer",
        ),
    )

    op.execute(
        """
        UPDATE restaurants
        SET
            live_menu_social_facebook_enabled = (
                live_menu_social_enabled
                AND facebook_url IS NOT NULL
                AND btrim(facebook_url) <> ''
            ),
            live_menu_social_instagram_enabled = (
                live_menu_social_enabled
                AND instagram_url IS NOT NULL
                AND btrim(instagram_url) <> ''
            ),
            live_menu_social_whatsapp_enabled = (
                live_menu_social_enabled
                AND whatsapp_phone IS NOT NULL
                AND btrim(whatsapp_phone) <> ''
            )
        """
    )


def downgrade() -> None:
    op.execute("SET LOCAL statement_timeout = '120s'")
    op.execute("SET LOCAL lock_timeout = '60s'")
    op.drop_column("restaurants", "live_menu_social_placement")
    op.drop_column("restaurants", "live_menu_social_whatsapp_enabled")
    op.drop_column("restaurants", "live_menu_social_instagram_enabled")
    op.drop_column("restaurants", "live_menu_social_facebook_enabled")

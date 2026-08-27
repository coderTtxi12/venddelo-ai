"""store rider APK download URL on the delivery provider

Revision ID: 0067_provider_rider_apk
Revises: 0066_driver_app_client
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0067_provider_rider_apk"
down_revision: str | None = "0066_driver_app_client"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("delivery_providers", sa.Column("rider_apk_path", sa.Text(), nullable=True))
    op.add_column("delivery_providers", sa.Column("rider_apk_url", sa.Text(), nullable=True))
    op.add_column(
        "delivery_providers", sa.Column("rider_apk_file_name", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("delivery_providers", "rider_apk_file_name")
    op.drop_column("delivery_providers", "rider_apk_url")
    op.drop_column("delivery_providers", "rider_apk_path")

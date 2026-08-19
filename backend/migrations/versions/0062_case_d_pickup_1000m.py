"""default case D restaurant radius to 1000 m

Revision ID: 0062_case_d_pickup_1000m
Revises: 0061_case_d_detour_meters
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0062_case_d_pickup_1000m"
down_revision: str | None = "0061_case_d_detour_meters"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "delivery_provider_assignment_settings",
        "max_pickup_detour_meters",
        server_default="1000",
    )
    op.execute(
        """
        UPDATE delivery_provider_assignment_settings
        SET
            max_pickup_detour_meters = 1000,
            max_pickup_detour_minutes = GREATEST(
                0,
                ROUND(1000.0 / (60 * COALESCE(pre_free_speed_mps, 8)))
            )
        WHERE max_pickup_detour_meters = 3840
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE delivery_provider_assignment_settings
        SET
            max_pickup_detour_meters = 3840,
            max_pickup_detour_minutes = GREATEST(
                0,
                ROUND(3840.0 / (60 * COALESCE(pre_free_speed_mps, 8)))
            )
        WHERE max_pickup_detour_meters = 1000
        """
    )
    op.alter_column(
        "delivery_provider_assignment_settings",
        "max_pickup_detour_meters",
        server_default="3840",
    )

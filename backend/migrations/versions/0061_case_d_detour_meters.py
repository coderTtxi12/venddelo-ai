"""store case D detours in meters

Revision ID: 0061_case_d_detour_meters
Revises: 0060_assignment_case_e
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0061_case_d_detour_meters"
down_revision: str | None = "0060_assignment_case_e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "delivery_provider_assignment_settings",
        sa.Column(
            "max_extra_route_meters",
            sa.Integer(),
            nullable=False,
            server_default="3840",
        ),
    )
    op.add_column(
        "delivery_provider_assignment_settings",
        sa.Column(
            "max_pickup_detour_meters",
            sa.Integer(),
            nullable=False,
            server_default="3840",
        ),
    )
    op.add_column(
        "delivery_provider_assignment_settings",
        sa.Column(
            "max_destination_detour_meters",
            sa.Integer(),
            nullable=False,
            server_default="3840",
        ),
    )
    op.execute(
        """
        UPDATE delivery_provider_assignment_settings
        SET
            max_extra_route_meters = GREATEST(
                0,
                ROUND(max_extra_route_minutes * 60 * COALESCE(pre_free_speed_mps, 8))
            ),
            max_pickup_detour_meters = GREATEST(
                0,
                ROUND(max_pickup_detour_minutes * 60 * COALESCE(pre_free_speed_mps, 8))
            ),
            max_destination_detour_meters = GREATEST(
                0,
                ROUND(max_destination_detour_minutes * 60 * COALESCE(pre_free_speed_mps, 8))
            )
        """
    )


def downgrade() -> None:
    op.drop_column("delivery_provider_assignment_settings", "max_destination_detour_meters")
    op.drop_column("delivery_provider_assignment_settings", "max_pickup_detour_meters")
    op.drop_column("delivery_provider_assignment_settings", "max_extra_route_meters")

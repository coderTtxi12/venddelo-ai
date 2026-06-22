"""delivery provider schedule kind (regular / night)

Revision ID: 0019_delivery_schedule_kind
Revises: 0018_delivery_onboarding
Create Date: 2026-06-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019_delivery_schedule_kind"
down_revision: str | None = "0018_delivery_onboarding"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "delivery_provider_schedules",
        sa.Column(
            "schedule_kind",
            sa.String(length=16),
            nullable=False,
            server_default="regular",
        ),
    )
    op.create_check_constraint(
        "schedule_kind_allowed",
        "delivery_provider_schedules",
        "schedule_kind IN ('regular', 'night')",
    )
    op.drop_index(
        "ix_delivery_provider_schedules_lookup",
        table_name="delivery_provider_schedules",
    )
    op.create_index(
        "ix_delivery_provider_schedules_lookup",
        "delivery_provider_schedules",
        ["delivery_provider_id", "schedule_kind", "day_of_week"],
        unique=False,
    )

    # Backfill default schedules for providers without any rows.
    op.execute(
        """
        INSERT INTO delivery_provider_schedules (
            delivery_provider_id, schedule_kind, day_of_week, opens_at, closes_at
        )
        SELECT p.id, kinds.kind, days.day_of_week, kinds.opens_at, kinds.closes_at
        FROM delivery_providers p
        CROSS JOIN generate_series(0, 6) AS days(day_of_week)
        CROSS JOIN (
            VALUES
                ('regular', '09:00:00'::time, '21:00:00'::time),
                ('night', '21:00:00'::time, '22:00:00'::time)
        ) AS kinds(kind, opens_at, closes_at)
        WHERE NOT EXISTS (
            SELECT 1
            FROM delivery_provider_schedules s
            WHERE s.delivery_provider_id = p.id
        )
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_delivery_provider_schedules_lookup",
        table_name="delivery_provider_schedules",
    )
    op.create_index(
        "ix_delivery_provider_schedules_lookup",
        "delivery_provider_schedules",
        ["delivery_provider_id", "day_of_week"],
        unique=False,
    )
    op.drop_constraint("schedule_kind_allowed", "delivery_provider_schedules", type_="check")
    op.drop_column("delivery_provider_schedules", "schedule_kind")

"""assignment engine event log

Revision ID: 0059_assignment_events
Revises: 0058_dispatch_status_times
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0059_assignment_events"
down_revision: str | None = "0058_dispatch_status_times"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "delivery_dispatch_assignment_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("tone", sa.String(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("case_applied", sa.String(), nullable=True),
        sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["request_id"], ["delivery_dispatch_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["driver_id"], ["delivery_drivers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "kind IN ('searched','offered','expired','rejected','timed_out','manual')",
            name="assignment_event_kind_allowed",
        ),
        sa.CheckConstraint(
            "tone IN ('ok','wait','warn')",
            name="assignment_event_tone_allowed",
        ),
        sa.CheckConstraint(
            "case_applied IS NULL OR case_applied IN ('A','B','C','D','M')",
            name="assignment_event_case_allowed",
        ),
    )
    op.create_index(
        "ix_delivery_dispatch_assignment_events_request_created",
        "delivery_dispatch_assignment_events",
        ["request_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_delivery_dispatch_assignment_events_request_created",
        table_name="delivery_dispatch_assignment_events",
    )
    op.drop_table("delivery_dispatch_assignment_events")

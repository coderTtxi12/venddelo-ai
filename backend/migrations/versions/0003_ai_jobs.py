"""add ai_jobs table

Revision ID: 0003_ai_jobs
Revises: 0002_add_owner_id
Create Date: 2026-06-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0003_ai_jobs"
down_revision: str | None = "0002_add_owner_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_jobs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("restaurant_id", sa.UUID(), nullable=False),
        sa.Column("job_type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(), server_default="pending", nullable=False),
        sa.Column("input_ref", sa.Text(), nullable=True),
        sa.Column("result_json", JSONB(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "job_type IN ('extract_menu','optimize_menu','pick_palette')",
            name="ai_job_type_allowed",
        ),
        sa.CheckConstraint(
            "status IN ('pending','processing','completed','failed')",
            name="ai_job_status_allowed",
        ),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_jobs_restaurant", "ai_jobs", ["restaurant_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_jobs_restaurant", table_name="ai_jobs")
    op.drop_table("ai_jobs")

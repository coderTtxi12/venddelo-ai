"""marketing agent accounts + marketing tasks for FB session spike

Revision ID: 0050_marketing_facebook_session_spike
Revises: 0049_delivery_provider_operator_role
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0050_marketing_facebook_session_spike"
down_revision: str | None = "0049_delivery_provider_operator_role"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "marketing_agent_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("fb_email_encrypted", sa.Text(), nullable=False),
        sa.Column("fb_password_encrypted", sa.Text(), nullable=False),
        sa.Column("storage_state_encrypted", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=64), server_default="active", nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("session_valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('active','checkpoint','banned','needs_manual_intervention')",
            name=op.f("ck_marketing_agent_accounts_status_allowed"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_marketing_agent_accounts")),
    )

    op.create_table(
        "marketing_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("restaurant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="queued", nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('queued','running','succeeded','failed')",
            name=op.f("ck_marketing_tasks_status_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["agent_id"],
            ["marketing_agent_accounts.id"],
            name=op.f("fk_marketing_tasks_agent_id_marketing_agent_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["restaurant_id"],
            ["restaurants.id"],
            name=op.f("fk_marketing_tasks_restaurant_id_restaurants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_marketing_tasks")),
    )
    op.create_index(op.f("ix_marketing_tasks_restaurant_id"), "marketing_tasks", ["restaurant_id"])
    op.create_index(op.f("ix_marketing_tasks_agent_id"), "marketing_tasks", ["agent_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_marketing_tasks_agent_id"), table_name="marketing_tasks")
    op.drop_index(op.f("ix_marketing_tasks_restaurant_id"), table_name="marketing_tasks")
    op.drop_table("marketing_tasks")
    op.drop_table("marketing_agent_accounts")

"""assistant llm usage table

Revision ID: 0033_assistant_usage
Revises: 0032_assistant_profile
Create Date: 2026-06-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0033_assistant_usage"
down_revision: str | None = "0032_assistant_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "assistant_llm_usage",
        sa.Column("restaurant_id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=True),
        sa.Column("message_id", sa.UUID(), nullable=True),
        sa.Column("call_type", sa.String(length=40), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("total_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["assistant_conversations.id"],
            name=op.f("fk_assistant_llm_usage_conversation_id_assistant_conversations"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["restaurant_id"],
            ["restaurants.id"],
            name=op.f("fk_assistant_llm_usage_restaurant_id_restaurants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assistant_llm_usage")),
    )
    op.create_index(
        "ix_assistant_llm_usage_restaurant_created",
        "assistant_llm_usage",
        ["restaurant_id", "created_at"],
    )
    op.create_index(
        "ix_assistant_llm_usage_restaurant_call_type",
        "assistant_llm_usage",
        ["restaurant_id", "call_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_assistant_llm_usage_restaurant_call_type", table_name="assistant_llm_usage")
    op.drop_index("ix_assistant_llm_usage_restaurant_created", table_name="assistant_llm_usage")
    op.drop_table("assistant_llm_usage")

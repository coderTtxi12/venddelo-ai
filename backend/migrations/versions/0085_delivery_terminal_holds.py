"""delivery terminal holds

Revision ID: 0085_delivery_terminal_holds
Revises: 0084_product_menu_schedule
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0085_delivery_terminal_holds"
down_revision: str | None = "0084_product_menu_schedule"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "delivery_terminal_holds",
        sa.Column("driver_id", sa.UUID(), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("held_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_by_user_id", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
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
            "status IN ('held','released')",
            name=op.f("ck_delivery_terminal_holds_status_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["driver_id"],
            ["delivery_drivers.id"],
            name=op.f("fk_delivery_terminal_holds_driver_id_delivery_drivers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["delivery_dispatch_requests.id"],
            name=op.f("fk_delivery_terminal_holds_request_id_delivery_dispatch_requests"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["released_by_user_id"],
            ["users.id"],
            name=op.f("fk_delivery_terminal_holds_released_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_terminal_holds")),
        sa.UniqueConstraint("request_id", name=op.f("uq_delivery_terminal_holds_request_id")),
    )
    op.create_index(
        "ix_delivery_terminal_holds_driver_status",
        "delivery_terminal_holds",
        ["driver_id", "status"],
    )
    op.create_index(
        "ix_delivery_terminal_holds_status",
        "delivery_terminal_holds",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_delivery_terminal_holds_status", table_name="delivery_terminal_holds")
    op.drop_index(
        "ix_delivery_terminal_holds_driver_status",
        table_name="delivery_terminal_holds",
    )
    op.drop_table("delivery_terminal_holds")

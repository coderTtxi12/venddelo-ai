"""add unique short_id to dispatch requests

Revision ID: 0056_dispatch_short_id
Revises: 0055_manual_offer_case
"""

from collections.abc import Sequence

import secrets

import sqlalchemy as sa
from alembic import op

revision: str = "0056_dispatch_short_id"
down_revision: str | None = "0055_manual_offer_case"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def _code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(5))


def upgrade() -> None:
    op.add_column(
        "delivery_dispatch_requests",
        sa.Column("short_id", sa.String(length=8), nullable=True),
    )
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM delivery_dispatch_requests WHERE short_id IS NULL"))
    used: set[str] = set()
    existing = conn.execute(
        sa.text("SELECT short_id FROM delivery_dispatch_requests WHERE short_id IS NOT NULL")
    )
    used.update(value for (value,) in existing if value)
    for (row_id,) in rows:
        candidate = _code()
        while candidate in used:
            candidate = _code()
        used.add(candidate)
        conn.execute(
            sa.text(
                "UPDATE delivery_dispatch_requests SET short_id = :code WHERE id = :id"
            ),
            {"code": candidate, "id": row_id},
        )
    op.alter_column(
        "delivery_dispatch_requests",
        "short_id",
        existing_type=sa.String(length=8),
        nullable=False,
    )
    op.create_unique_constraint(
        op.f("uq_delivery_dispatch_requests_short_id"),
        "delivery_dispatch_requests",
        ["short_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("uq_delivery_dispatch_requests_short_id"),
        "delivery_dispatch_requests",
        type_="unique",
    )
    op.drop_column("delivery_dispatch_requests", "short_id")

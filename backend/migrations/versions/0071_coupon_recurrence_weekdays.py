"""coupon recurrence weekdays

Revision ID: 0071_coupon_recurrence_weekdays
Revises: 0070_coupons
Create Date: 2026-09-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0071_coupon_recurrence_weekdays"
down_revision: str | None = "0070_coupons"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "coupons",
        sa.Column("recurrence_weekdays", postgresql.ARRAY(sa.SmallInteger()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("coupons", "recurrence_weekdays")

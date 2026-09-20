"""allow accepted dispatch status for live-menu tracking stubs

Revision ID: 0078_dispatch_accepted_status
Revises: 0077_partnership_on_hold
Create Date: 2026-09-20
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0078_dispatch_accepted_status"
down_revision: str | None = "0077_partnership_on_hold"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CONSTRAINT = "ck_delivery_dispatch_requests_status_allowed"
_NEW_STATUSES = (
    "status IN ("
    "'accepted','scheduled','searching','offered','assigned','picked_up',"
    "'in_transit','delivered','unassigned','cancelled'"
    ")"
)
_OLD_STATUSES = (
    "status IN ("
    "'scheduled','searching','offered','assigned','picked_up',"
    "'in_transit','delivered','unassigned','cancelled'"
    ")"
)


def upgrade() -> None:
    op.drop_constraint(op.f(_CONSTRAINT), "delivery_dispatch_requests", type_="check")
    op.create_check_constraint(
        op.f(_CONSTRAINT),
        "delivery_dispatch_requests",
        _NEW_STATUSES,
    )


def downgrade() -> None:
    op.drop_constraint(op.f(_CONSTRAINT), "delivery_dispatch_requests", type_="check")
    op.create_check_constraint(
        op.f(_CONSTRAINT),
        "delivery_dispatch_requests",
        _OLD_STATUSES,
    )

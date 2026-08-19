"""allow high-demand idle assignment case E

Revision ID: 0060_assignment_case_e
Revises: 0059_assignment_events
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0060_assignment_case_e"
down_revision: str | None = "0059_assignment_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OFFER_CASE_CHECK = "ck_delivery_dispatch_offers_case_applied_allowed"
_EVENT_CASE_CHECK = "assignment_event_case_allowed"


def upgrade() -> None:
    op.drop_constraint(op.f(_OFFER_CASE_CHECK), "delivery_dispatch_offers", type_="check")
    op.create_check_constraint(
        op.f(_OFFER_CASE_CHECK),
        "delivery_dispatch_offers",
        "case_applied IN ('A','B','C','D','E','M')",
    )
    op.drop_constraint(_EVENT_CASE_CHECK, "delivery_dispatch_assignment_events", type_="check")
    op.create_check_constraint(
        _EVENT_CASE_CHECK,
        "delivery_dispatch_assignment_events",
        "case_applied IS NULL OR case_applied IN ('A','B','C','D','E','M')",
    )


def downgrade() -> None:
    op.drop_constraint(_EVENT_CASE_CHECK, "delivery_dispatch_assignment_events", type_="check")
    op.create_check_constraint(
        _EVENT_CASE_CHECK,
        "delivery_dispatch_assignment_events",
        "case_applied IS NULL OR case_applied IN ('A','B','C','D','M')",
    )
    op.drop_constraint(op.f(_OFFER_CASE_CHECK), "delivery_dispatch_offers", type_="check")
    op.create_check_constraint(
        op.f(_OFFER_CASE_CHECK),
        "delivery_dispatch_offers",
        "case_applied IN ('A','B','C','D','M')",
    )

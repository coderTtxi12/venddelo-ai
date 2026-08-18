"""allow manual offer case M

Revision ID: 0055_manual_offer_case
Revises: 0054_driver_emergency_contact
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0055_manual_offer_case"
down_revision: str | None = "0054_driver_emergency_contact"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CASE_CHECK = "ck_delivery_dispatch_offers_case_applied_allowed"


def upgrade() -> None:
    op.drop_constraint(op.f(_CASE_CHECK), "delivery_dispatch_offers", type_="check")
    op.create_check_constraint(
        op.f(_CASE_CHECK),
        "delivery_dispatch_offers",
        "case_applied IN ('A','B','C','D','M')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f(_CASE_CHECK), "delivery_dispatch_offers", type_="check")
    op.create_check_constraint(
        op.f(_CASE_CHECK),
        "delivery_dispatch_offers",
        "case_applied IN ('A','B','C','D')",
    )

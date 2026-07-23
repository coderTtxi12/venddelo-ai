"""delivery provider operator role and invite member_role

Revision ID: 0049_delivery_provider_operator_role
Revises: 0048_restaurant_live_menu_social_controls
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0049_delivery_provider_operator_role"
down_revision: str | None = "0048_restaurant_live_menu_social_controls"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_delivery_provider_members_member_role_allowed",
        "delivery_provider_members",
        type_="check",
    )
    op.create_check_constraint(
        "ck_delivery_provider_members_member_role_allowed",
        "delivery_provider_members",
        "member_role IN ('owner','admin','operator','dispatcher','driver')",
    )

    op.add_column(
        "delivery_provider_admin_invites",
        sa.Column(
            "member_role",
            sa.String(),
            nullable=False,
            server_default="admin",
        ),
    )
    op.create_check_constraint(
        "ck_delivery_provider_admin_invites_member_role_allowed",
        "delivery_provider_admin_invites",
        "member_role IN ('admin','operator')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_delivery_provider_admin_invites_member_role_allowed",
        "delivery_provider_admin_invites",
        type_="check",
    )
    op.drop_column("delivery_provider_admin_invites", "member_role")

    op.drop_constraint(
        "ck_delivery_provider_members_member_role_allowed",
        "delivery_provider_members",
        type_="check",
    )
    op.create_check_constraint(
        "ck_delivery_provider_members_member_role_allowed",
        "delivery_provider_members",
        "member_role IN ('owner','admin','dispatcher','driver')",
    )

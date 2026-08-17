"""delivery dispatch: drivers, assignment settings, dispatch requests

Revision ID: 0052_delivery_dispatch
Revises: 0051_delivery_multi_zone
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0052_delivery_dispatch"
down_revision: str | None = "0051_delivery_multi_zone"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LEAD_TIME_SEED_ROWS: tuple[tuple[int, int], ...] = (
    (5, 0),
    (10, 5),
    (15, 6),
    (20, 7),
    (30, 9),
)


def upgrade() -> None:
    op.create_table(
        "delivery_drivers",
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("first_name", sa.Text(), nullable=False),
        sa.Column("last_name", sa.Text(), nullable=False),
        sa.Column("phone", sa.Text(), nullable=False),
        sa.Column("profile_photo_path", sa.Text(), nullable=False),
        sa.Column("ine_document_path", sa.Text(), nullable=False),
        sa.Column("license_document_path", sa.Text(), nullable=False),
        sa.Column("insurance_document_path", sa.Text(), nullable=False),
        sa.Column(
            "credit_limit_cents",
            sa.Integer(),
            nullable=False,
            server_default="50000",
        ),
        sa.Column(
            "credit_held_cents",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("compartment_size", sa.String(), nullable=False),
        sa.Column("plate", sa.Text(), nullable=False),
        sa.Column("motorcycle_brand", sa.Text(), nullable=False),
        sa.Column("motorcycle_color", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="invited"),
        sa.Column("is_online", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("last_lat", sa.Float(), nullable=True),
        sa.Column("last_lng", sa.Float(), nullable=True),
        sa.Column("location_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fcm_token", sa.Text(), nullable=True),
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
            "credit_held_cents >= 0 AND credit_held_cents <= credit_limit_cents",
            name=op.f("ck_delivery_drivers_credit_bounds"),
        ),
        sa.CheckConstraint(
            "compartment_size IN ('normal','grande')",
            name=op.f("ck_delivery_drivers_compartment_size_allowed"),
        ),
        sa.CheckConstraint(
            "status IN ('invited','active','blocked')",
            name=op.f("ck_delivery_drivers_status_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["delivery_provider_id"],
            ["delivery_providers.id"],
            name=op.f("fk_delivery_drivers_delivery_provider_id_delivery_providers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_delivery_drivers_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_drivers")),
    )
    op.create_index(
        "uq_delivery_drivers_email_per_provider",
        "delivery_drivers",
        ["delivery_provider_id", sa.text("lower(btrim(email))")],
        unique=True,
    )
    op.create_index(
        "ix_delivery_drivers_dispatch_lookup",
        "delivery_drivers",
        ["delivery_provider_id", "status", "is_online"],
        unique=False,
    )

    op.create_table(
        "delivery_provider_assignment_settings",
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column(
            "offer_timeout_seconds",
            sa.Integer(),
            nullable=False,
            server_default="45",
        ),
        sa.Column(
            "pre_free_eta_seconds",
            sa.Integer(),
            nullable=False,
            server_default="60",
        ),
        sa.Column(
            "driver_location_staleness_seconds",
            sa.Integer(),
            nullable=False,
            server_default="90",
        ),
        sa.Column(
            "min_protected_drivers",
            sa.Integer(),
            nullable=False,
            server_default="2",
        ),
        sa.Column(
            "high_demand_available_drivers_max",
            sa.Integer(),
            nullable=False,
            server_default="2",
        ),
        sa.Column(
            "high_demand_occupied_ratio",
            sa.Float(),
            nullable=False,
            server_default="0.80",
        ),
        sa.Column(
            "high_demand_pending_min",
            sa.Integer(),
            nullable=False,
            server_default="5",
        ),
        sa.Column(
            "near_destination_radius_meters",
            sa.Integer(),
            nullable=False,
            server_default="800",
        ),
        sa.Column(
            "max_extra_route_minutes",
            sa.Integer(),
            nullable=False,
            server_default="8",
        ),
        sa.Column(
            "max_pickup_detour_minutes",
            sa.Integer(),
            nullable=False,
            server_default="8",
        ),
        sa.Column(
            "max_destination_detour_minutes",
            sa.Integer(),
            nullable=False,
            server_default="8",
        ),
        sa.Column(
            "max_active_packages_per_driver",
            sa.Integer(),
            nullable=False,
            server_default="3",
        ),
        sa.Column(
            "assignment_retry_seconds",
            sa.Integer(),
            nullable=False,
            server_default="30",
        ),
        sa.Column(
            "assignment_timeout_seconds",
            sa.Integer(),
            nullable=False,
            server_default="900",
        ),
        sa.Column(
            "pre_free_speed_mps",
            sa.Float(),
            nullable=False,
            server_default="8",
        ),
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
        sa.ForeignKeyConstraint(
            ["delivery_provider_id"],
            ["delivery_providers.id"],
            name=op.f(
                "fk_delivery_provider_assignment_settings_delivery_provider_id_delivery_providers"
            ),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "delivery_provider_id",
            name=op.f("pk_delivery_provider_assignment_settings"),
        ),
    )

    op.create_table(
        "delivery_search_lead_times",
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column("prep_minutes", sa.Integer(), nullable=False),
        sa.Column("search_ahead_minutes", sa.Integer(), nullable=False),
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
            "search_ahead_minutes >= 0",
            name=op.f("ck_delivery_search_lead_times_search_ahead_nonneg"),
        ),
        sa.ForeignKeyConstraint(
            ["delivery_provider_id"],
            ["delivery_providers.id"],
            name=op.f("fk_delivery_search_lead_times_delivery_provider_id_delivery_providers"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_search_lead_times")),
        sa.UniqueConstraint(
            "delivery_provider_id",
            "prep_minutes",
            name=op.f("uq_delivery_search_lead_times_delivery_provider_id"),
        ),
    )

    op.create_table(
        "delivery_dispatch_requests",
        sa.Column("restaurant_id", sa.UUID(), nullable=False),
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column("zone_id", sa.UUID(), nullable=False),
        sa.Column("customer_name", sa.Text(), nullable=False),
        sa.Column("customer_phone", sa.Text(), nullable=False),
        sa.Column("dropoff_lat", sa.Float(), nullable=False),
        sa.Column("dropoff_lng", sa.Float(), nullable=False),
        sa.Column("dropoff_address", sa.Text(), nullable=False),
        sa.Column("dropoff_maps_url", sa.Text(), nullable=True),
        sa.Column("payment_method", sa.String(), nullable=False),
        sa.Column("collect_cents", sa.Integer(), nullable=False),
        sa.Column("cash_denomination_cents", sa.Integer(), nullable=True),
        sa.Column("package_size", sa.String(), nullable=False),
        sa.Column("package_count", sa.Integer(), nullable=False),
        sa.Column("ready_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("search_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("quoted_fee_cents", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("assigned_driver_id", sa.UUID(), nullable=True),
        sa.Column("tracking_token", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("decision_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "cycle_rejected_driver_ids",
            postgresql.ARRAY(sa.UUID()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("dispatch_group_id", sa.UUID(), nullable=True),
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
        sa.CheckConstraint("package_count >= 1", name=op.f("ck_delivery_dispatch_requests_package_count_min")),
        sa.CheckConstraint(
            "payment_method IN ('cash','transfer','card_terminal')",
            name=op.f("ck_delivery_dispatch_requests_payment_method_allowed"),
        ),
        sa.CheckConstraint(
            "package_size IN ('normal','grande')",
            name=op.f("ck_delivery_dispatch_requests_package_size_allowed"),
        ),
        sa.CheckConstraint(
            "status IN ("
            "'scheduled','searching','offered','assigned','picked_up',"
            "'in_transit','delivered','unassigned','cancelled'"
            ")",
            name=op.f("ck_delivery_dispatch_requests_status_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["assigned_driver_id"],
            ["delivery_drivers.id"],
            name=op.f("fk_delivery_dispatch_requests_assigned_driver_id_delivery_drivers"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["delivery_provider_id"],
            ["delivery_providers.id"],
            name=op.f("fk_delivery_dispatch_requests_delivery_provider_id_delivery_providers"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["restaurant_id"],
            ["restaurants.id"],
            name=op.f("fk_delivery_dispatch_requests_restaurant_id_restaurants"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["zone_id"],
            ["delivery_provider_zones.id"],
            name=op.f("fk_delivery_dispatch_requests_zone_id_delivery_provider_zones"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_dispatch_requests")),
        sa.UniqueConstraint("tracking_token", name=op.f("uq_delivery_dispatch_requests_tracking_token")),
    )
    op.create_index(
        "ix_delivery_dispatch_requests_provider_lookup",
        "delivery_dispatch_requests",
        ["delivery_provider_id", "status", "search_at"],
        unique=False,
    )
    op.create_index(
        "ix_delivery_dispatch_requests_driver_lookup",
        "delivery_dispatch_requests",
        ["assigned_driver_id", "status"],
        unique=False,
    )

    op.create_table(
        "delivery_dispatch_offers",
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("driver_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("case_applied", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("score_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
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
            "status IN ('offered','accepted','rejected','expired')",
            name=op.f("ck_delivery_dispatch_offers_status_allowed"),
        ),
        sa.CheckConstraint(
            "case_applied IN ('A','B','C','D')",
            name=op.f("ck_delivery_dispatch_offers_case_applied_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["driver_id"],
            ["delivery_drivers.id"],
            name=op.f("fk_delivery_dispatch_offers_driver_id_delivery_drivers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["delivery_dispatch_requests.id"],
            name=op.f("fk_delivery_dispatch_offers_request_id_delivery_dispatch_requests"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_dispatch_offers")),
    )
    op.create_index(
        "uq_delivery_dispatch_offers_one_offered_per_driver",
        "delivery_dispatch_offers",
        ["driver_id"],
        unique=True,
        postgresql_where=sa.text("status = 'offered'"),
    )
    op.create_index(
        "uq_delivery_dispatch_offers_one_offered_per_request",
        "delivery_dispatch_offers",
        ["request_id"],
        unique=True,
        postgresql_where=sa.text("status = 'offered'"),
    )

    op.create_table(
        "delivery_credit_holds",
        sa.Column("driver_id", sa.UUID(), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
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
            name=op.f("ck_delivery_credit_holds_status_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["driver_id"],
            ["delivery_drivers.id"],
            name=op.f("fk_delivery_credit_holds_driver_id_delivery_drivers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["released_by_user_id"],
            ["users.id"],
            name=op.f("fk_delivery_credit_holds_released_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["delivery_dispatch_requests.id"],
            name=op.f("fk_delivery_credit_holds_request_id_delivery_dispatch_requests"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_credit_holds")),
        sa.UniqueConstraint("request_id", name=op.f("uq_delivery_credit_holds_request_id")),
    )

    connection = op.get_bind()
    connection.execute(
        sa.text(
            """
            INSERT INTO delivery_provider_assignment_settings (delivery_provider_id)
            SELECT id FROM delivery_providers
            ON CONFLICT (delivery_provider_id) DO NOTHING
            """
        )
    )
    for prep_minutes, search_ahead_minutes in LEAD_TIME_SEED_ROWS:
        connection.execute(
            sa.text(
                """
                INSERT INTO delivery_search_lead_times (
                    delivery_provider_id,
                    prep_minutes,
                    search_ahead_minutes
                )
                SELECT id, :prep_minutes, :search_ahead_minutes
                FROM delivery_providers
                ON CONFLICT (delivery_provider_id, prep_minutes) DO NOTHING
                """
            ),
            {"prep_minutes": prep_minutes, "search_ahead_minutes": search_ahead_minutes},
        )


def downgrade() -> None:
    op.drop_table("delivery_credit_holds")
    op.drop_table("delivery_dispatch_offers")
    op.drop_table("delivery_dispatch_requests")
    op.drop_table("delivery_search_lead_times")
    op.drop_table("delivery_provider_assignment_settings")
    op.drop_table("delivery_drivers")

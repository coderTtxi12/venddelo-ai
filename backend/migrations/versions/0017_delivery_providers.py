"""delivery providers: zones, tariffs, schedules, assignments

Revision ID: 0017_delivery_providers
Revises: 0016_dm_special_cats
Create Date: 2026-06-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography

revision: str = "0017_delivery_providers"
down_revision: str | None = "0016_dm_special_cats"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "delivery_providers",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("legal_name", sa.Text(), nullable=True),
        sa.Column("slug", sa.String(length=63), nullable=False),
        sa.Column("contact_email", sa.Text(), nullable=True),
        sa.Column("contact_phone", sa.String(length=20), nullable=True),
        sa.Column("logo_path", sa.Text(), nullable=True),
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=False,
            server_default="America/Mexico_City",
        ),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
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
            "status IN ('draft','active','suspended')",
            name=op.f("ck_delivery_providers_status_allowed"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_providers")),
        sa.UniqueConstraint("slug", name=op.f("uq_delivery_providers_slug")),
    )
    op.create_index(
        "ix_delivery_providers_status",
        "delivery_providers",
        ["status"],
        unique=False,
    )

    op.create_table(
        "delivery_provider_members",
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("member_role", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
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
            "member_role IN ('owner','admin','dispatcher','driver')",
            name=op.f("ck_delivery_provider_members_member_role_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["delivery_provider_id"],
            ["delivery_providers.id"],
            name=op.f("fk_delivery_provider_members_delivery_provider_id_delivery_providers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_delivery_provider_members_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_provider_members")),
        sa.UniqueConstraint(
            "delivery_provider_id",
            "user_id",
            name=op.f("uq_delivery_provider_members_delivery_provider_id"),
        ),
    )

    op.create_table(
        "delivery_provider_zones",
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("zone_kind", sa.String(), nullable=False),
        sa.Column(
            "boundary",
            Geography(geometry_type="POLYGON", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column("center_lat", sa.Float(), nullable=True),
        sa.Column("center_lng", sa.Float(), nullable=True),
        sa.Column("radius_meters", sa.Integer(), nullable=True),
        sa.Column("priority", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
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
            "zone_kind IN ('polygon','radius')",
            name=op.f("ck_delivery_provider_zones_zone_kind_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["delivery_provider_id"],
            ["delivery_providers.id"],
            name=op.f("fk_delivery_provider_zones_delivery_provider_id_delivery_providers"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_provider_zones")),
    )
    op.create_index(
        "ix_delivery_provider_zones_lookup",
        "delivery_provider_zones",
        ["delivery_provider_id", "is_active"],
        unique=False,
    )
    op.execute(
        """
        CREATE INDEX ix_delivery_provider_zones_boundary
        ON delivery_provider_zones
        USING GIST (boundary)
        WHERE boundary IS NOT NULL
        """
    )

    op.create_table(
        "delivery_provider_schedules",
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column("day_of_week", sa.SmallInteger(), nullable=False),
        sa.Column("opens_at", sa.Time(), nullable=False),
        sa.Column("closes_at", sa.Time(), nullable=False),
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
            "day_of_week BETWEEN 0 AND 6",
            name=op.f("ck_delivery_provider_schedules_day_of_week_range"),
        ),
        sa.ForeignKeyConstraint(
            ["delivery_provider_id"],
            ["delivery_providers.id"],
            name=op.f(
                "fk_delivery_provider_schedules_delivery_provider_id_delivery_providers"
            ),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_provider_schedules")),
    )
    op.create_index(
        "ix_delivery_provider_schedules_lookup",
        "delivery_provider_schedules",
        ["delivery_provider_id", "day_of_week"],
        unique=False,
    )

    op.create_table(
        "delivery_provider_tariffs",
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column("zone_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("pricing_model", sa.String(), nullable=False),
        sa.Column("base_fee_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("per_km_cents", sa.Integer(), nullable=True),
        sa.Column("free_distance_meters", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_distance_meters", sa.Integer(), nullable=True),
        sa.Column("min_order_subtotal_cents", sa.Integer(), nullable=True),
        sa.Column("currency", sa.String(length=3), server_default="MXN", nullable=False),
        sa.Column(
            "effective_from",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("effective_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
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
        sa.CheckConstraint("base_fee_cents >= 0", name=op.f("ck_delivery_provider_tariffs_base_fee_nonneg")),
        sa.CheckConstraint(
            "pricing_model IN ('flat','distance','zone_flat','zone_distance')",
            name=op.f("ck_delivery_provider_tariffs_pricing_model_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["delivery_provider_id"],
            ["delivery_providers.id"],
            name=op.f("fk_delivery_provider_tariffs_delivery_provider_id_delivery_providers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["zone_id"],
            ["delivery_provider_zones.id"],
            name=op.f("fk_delivery_provider_tariffs_zone_id_delivery_provider_zones"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_provider_tariffs")),
    )
    op.create_index(
        "ix_delivery_provider_tariffs_lookup",
        "delivery_provider_tariffs",
        ["delivery_provider_id", "is_active", "effective_from"],
        unique=False,
    )

    op.create_table(
        "restaurant_delivery_providers",
        sa.Column("restaurant_id", sa.UUID(), nullable=False),
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(), server_default="pending", nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
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
            "status IN ('pending','active','suspended')",
            name=op.f("ck_restaurant_delivery_providers_status_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["delivery_provider_id"],
            ["delivery_providers.id"],
            name=op.f(
                "fk_restaurant_delivery_providers_delivery_provider_id_delivery_providers"
            ),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["restaurant_id"],
            ["restaurants.id"],
            name=op.f("fk_restaurant_delivery_providers_restaurant_id_restaurants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_restaurant_delivery_providers")),
        sa.UniqueConstraint(
            "restaurant_id",
            "delivery_provider_id",
            name=op.f("uq_restaurant_delivery_providers_restaurant_id"),
        ),
    )
    op.create_index(
        "uq_restaurant_delivery_providers_default",
        "restaurant_delivery_providers",
        ["restaurant_id"],
        unique=True,
        postgresql_where=sa.text("is_default = true AND status = 'active'"),
    )

    op.add_column(
        "orders",
        sa.Column("delivery_fee_cents", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("orders", sa.Column("delivery_provider_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_orders_delivery_provider_id_delivery_providers"),
        "orders",
        "delivery_providers",
        ["delivery_provider_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "delivery_assignments",
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("delivery_provider_id", sa.UUID(), nullable=False),
        sa.Column("tariff_id", sa.UUID(), nullable=True),
        sa.Column("zone_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.String(), server_default="quoted", nullable=False),
        sa.Column("quoted_fee_cents", sa.Integer(), nullable=False),
        sa.Column("distance_meters", sa.Integer(), nullable=True),
        sa.Column("delivery_lat", sa.Float(), nullable=True),
        sa.Column("delivery_lng", sa.Float(), nullable=True),
        sa.Column("pickup_lat", sa.Float(), nullable=True),
        sa.Column("pickup_lng", sa.Float(), nullable=True),
        sa.Column("assigned_driver_user_id", sa.UUID(), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("picked_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
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
            "status IN ('quoted','assigned','picked_up','in_transit','delivered','failed','cancelled')",
            name=op.f("ck_delivery_assignments_status_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["assigned_driver_user_id"],
            ["users.id"],
            name=op.f("fk_delivery_assignments_assigned_driver_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["delivery_provider_id"],
            ["delivery_providers.id"],
            name=op.f("fk_delivery_assignments_delivery_provider_id_delivery_providers"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_delivery_assignments_order_id_orders"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tariff_id"],
            ["delivery_provider_tariffs.id"],
            name=op.f("fk_delivery_assignments_tariff_id_delivery_provider_tariffs"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["zone_id"],
            ["delivery_provider_zones.id"],
            name=op.f("fk_delivery_assignments_zone_id_delivery_provider_zones"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_assignments")),
        sa.UniqueConstraint("order_id", name=op.f("uq_delivery_assignments_order_id")),
    )
    op.create_index(
        "ix_delivery_assignments_listing",
        "delivery_assignments",
        ["delivery_provider_id", "status", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_delivery_assignments_listing", table_name="delivery_assignments")
    op.drop_table("delivery_assignments")

    op.drop_constraint(
        op.f("fk_orders_delivery_provider_id_delivery_providers"),
        "orders",
        type_="foreignkey",
    )
    op.drop_column("orders", "delivery_provider_id")
    op.drop_column("orders", "delivery_fee_cents")

    op.drop_index(
        "uq_restaurant_delivery_providers_default",
        table_name="restaurant_delivery_providers",
    )
    op.drop_table("restaurant_delivery_providers")

    op.drop_index("ix_delivery_provider_tariffs_lookup", table_name="delivery_provider_tariffs")
    op.drop_table("delivery_provider_tariffs")

    op.drop_index(
        "ix_delivery_provider_schedules_lookup",
        table_name="delivery_provider_schedules",
    )
    op.drop_table("delivery_provider_schedules")

    op.execute("DROP INDEX IF EXISTS ix_delivery_provider_zones_boundary")
    op.drop_index("ix_delivery_provider_zones_lookup", table_name="delivery_provider_zones")
    op.drop_table("delivery_provider_zones")

    op.drop_table("delivery_provider_members")

    op.drop_index("ix_delivery_providers_status", table_name="delivery_providers")
    op.drop_table("delivery_providers")

    # PostGIS extension is shared; leave installed on downgrade.

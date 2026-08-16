"""delivery provider multi-zone: pricing, schedules, pause on zones

Revision ID: 0051_delivery_multi_zone
Revises: 0050_marketing_facebook_session_spike
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

revision: str = "0051_delivery_multi_zone"
down_revision: str | None = "0050_marketing_facebook_session_spike"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEDULE_SEED_ROWS: tuple[tuple[str, str, str], ...] = (
    ("regular", "09:00:00", "21:00:00"),
    ("night", "21:00:00", "22:00:00"),
)


def _seed_extra_zone_configs(connection) -> None:
    from app.modules.delivery_providers.pricing import config_to_json, default_pricing_config

    extra_zones = connection.execute(
        text(
            """
            SELECT z.id, z.delivery_provider_id
            FROM delivery_provider_zones z
            WHERE NOT EXISTS (
                SELECT 1
                FROM delivery_provider_pricing_configs c
                WHERE c.zone_id = z.id
            )
            """
        )
    ).fetchall()

    if not extra_zones:
        return

    payload = config_to_json(default_pricing_config())
    inside_polygon = payload["inside_polygon"]
    outside_polygon = payload["outside_polygon"]

    for zone_id, provider_id in extra_zones:
        connection.execute(
            text(
                """
                INSERT INTO delivery_provider_pricing_configs (
                    delivery_provider_id,
                    zone_id,
                    inside_polygon,
                    outside_polygon
                )
                VALUES (
                    :provider_id,
                    :zone_id,
                    CAST(:inside_polygon AS jsonb),
                    CAST(:outside_polygon AS jsonb)
                )
                """
            ),
            {
                "provider_id": str(provider_id),
                "zone_id": str(zone_id),
                "inside_polygon": json.dumps(inside_polygon),
                "outside_polygon": json.dumps(outside_polygon),
            },
        )

        for day_of_week in range(7):
            for schedule_kind, opens_at, closes_at in SCHEDULE_SEED_ROWS:
                connection.execute(
                    text(
                        """
                        INSERT INTO delivery_provider_schedules (
                            delivery_provider_id,
                            zone_id,
                            schedule_kind,
                            day_of_week,
                            opens_at,
                            closes_at
                        )
                        VALUES (
                            :provider_id,
                            :zone_id,
                            :schedule_kind,
                            :day_of_week,
                            CAST(:opens_at AS time),
                            CAST(:closes_at AS time)
                        )
                        """
                    ),
                    {
                        "provider_id": str(provider_id),
                        "zone_id": str(zone_id),
                        "schedule_kind": schedule_kind,
                        "day_of_week": day_of_week,
                        "opens_at": opens_at,
                        "closes_at": closes_at,
                    },
                )


def upgrade() -> None:
    op.add_column(
        "delivery_provider_zones",
        sa.Column(
            "weather_mode",
            sa.String(length=16),
            nullable=False,
            server_default="none",
        ),
    )
    op.add_column(
        "delivery_provider_zones",
        sa.Column(
            "service_manually_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.create_check_constraint(
        op.f("ck_delivery_provider_zones_weather_mode_allowed"),
        "delivery_provider_zones",
        "weather_mode IN ('none','light','heavy','intense')",
    )

    op.add_column(
        "delivery_provider_pricing_configs",
        sa.Column("zone_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "delivery_provider_schedules",
        sa.Column("zone_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "restaurant_delivery_providers",
        sa.Column("zone_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    op.execute(
        """
        WITH primary_zone AS (
          SELECT DISTINCT ON (delivery_provider_id) id, delivery_provider_id
          FROM delivery_provider_zones
          WHERE is_active = true
          ORDER BY delivery_provider_id, priority ASC, created_at ASC
        )
        UPDATE delivery_provider_zones z
        SET weather_mode = p.weather_mode,
            service_manually_enabled = p.service_manually_enabled
        FROM delivery_providers p
        JOIN primary_zone pz ON pz.delivery_provider_id = p.id
        WHERE z.id = pz.id
        """
    )

    op.execute(
        """
        UPDATE delivery_provider_pricing_configs c
        SET zone_id = pz.id
        FROM (
          SELECT DISTINCT ON (delivery_provider_id) id, delivery_provider_id
          FROM delivery_provider_zones
          WHERE is_active = true
          ORDER BY delivery_provider_id, priority ASC, created_at ASC
        ) pz
        WHERE c.delivery_provider_id = pz.delivery_provider_id
        """
    )

    op.execute(
        """
        UPDATE delivery_provider_schedules s
        SET zone_id = pz.id
        FROM (
          SELECT DISTINCT ON (delivery_provider_id) id, delivery_provider_id
          FROM delivery_provider_zones
          WHERE is_active = true
          ORDER BY delivery_provider_id, priority ASC, created_at ASC
        ) pz
        WHERE s.delivery_provider_id = pz.delivery_provider_id
        """
    )

    op.execute(
        """
        UPDATE restaurant_delivery_providers r
        SET zone_id = pz.id
        FROM (
          SELECT DISTINCT ON (delivery_provider_id) id, delivery_provider_id
          FROM delivery_provider_zones
          WHERE is_active = true
          ORDER BY delivery_provider_id, priority ASC, created_at ASC
        ) pz
        WHERE r.delivery_provider_id = pz.delivery_provider_id
        """
    )

    connection = op.get_bind()
    # Zoneless providers with no pricing/schedules/partnerships (e.g. 0023 mexy-reparto
    # stub) are allowed — we never invent a polygon. Fail only when child rows exist
    # that could not receive zone_id because no zone exists.
    missing_zone = connection.execute(
        text(
            """
            SELECT 1
            FROM delivery_providers p
            WHERE NOT EXISTS (
                SELECT 1
                FROM delivery_provider_zones z
                WHERE z.delivery_provider_id = p.id
            )
            AND (
                EXISTS (
                    SELECT 1
                    FROM delivery_provider_pricing_configs c
                    WHERE c.delivery_provider_id = p.id
                )
                OR EXISTS (
                    SELECT 1
                    FROM delivery_provider_schedules s
                    WHERE s.delivery_provider_id = p.id
                )
                OR EXISTS (
                    SELECT 1
                    FROM restaurant_delivery_providers r
                    WHERE r.delivery_provider_id = p.id
                )
            )
            LIMIT 1
            """
        )
    ).first()
    if missing_zone is not None:
        raise RuntimeError("delivery provider missing zone")

    null_pricing = connection.execute(
        text(
            """
            SELECT 1 FROM delivery_provider_pricing_configs WHERE zone_id IS NULL LIMIT 1
            """
        )
    ).first()
    if null_pricing is not None:
        raise RuntimeError("pricing config missing zone_id after backfill")

    null_schedule = connection.execute(
        text(
            """
            SELECT 1 FROM delivery_provider_schedules WHERE zone_id IS NULL LIMIT 1
            """
        )
    ).first()
    if null_schedule is not None:
        raise RuntimeError("schedule missing zone_id after backfill")

    null_partnership = connection.execute(
        text(
            """
            SELECT 1 FROM restaurant_delivery_providers WHERE zone_id IS NULL LIMIT 1
            """
        )
    ).first()
    if null_partnership is not None:
        raise RuntimeError("partnership missing zone_id after backfill")

    _seed_extra_zone_configs(connection)

    op.alter_column("delivery_provider_pricing_configs", "zone_id", nullable=False)
    op.alter_column("delivery_provider_schedules", "zone_id", nullable=False)
    op.alter_column("restaurant_delivery_providers", "zone_id", nullable=False)

    op.create_foreign_key(
        op.f("fk_delivery_provider_pricing_configs_zone_id_delivery_provider_zones"),
        "delivery_provider_pricing_configs",
        "delivery_provider_zones",
        ["zone_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        op.f("fk_delivery_provider_schedules_zone_id_delivery_provider_zones"),
        "delivery_provider_schedules",
        "delivery_provider_zones",
        ["zone_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        op.f("fk_restaurant_delivery_providers_zone_id_delivery_provider_zones"),
        "restaurant_delivery_providers",
        "delivery_provider_zones",
        ["zone_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.create_unique_constraint(
        op.f("uq_delivery_provider_pricing_configs_zone_id"),
        "delivery_provider_pricing_configs",
        ["zone_id"],
    )
    op.drop_constraint(
        op.f("uq_delivery_provider_pricing_configs_delivery_provider_id"),
        "delivery_provider_pricing_configs",
        type_="unique",
    )

    op.drop_index(
        "ix_delivery_provider_schedules_lookup",
        table_name="delivery_provider_schedules",
    )
    op.create_index(
        "ix_delivery_provider_schedules_lookup",
        "delivery_provider_schedules",
        ["zone_id", "schedule_kind", "day_of_week"],
        unique=False,
    )

    op.execute(
        """
        CREATE UNIQUE INDEX uq_delivery_provider_zones_name_per_provider
        ON delivery_provider_zones (delivery_provider_id, lower(btrim(name)))
        """
    )

    op.drop_constraint("weather_mode_allowed", "delivery_providers", type_="check")
    op.drop_column("delivery_providers", "weather_mode")
    op.drop_column("delivery_providers", "service_manually_enabled")


def downgrade() -> None:
    op.add_column(
        "delivery_providers",
        sa.Column(
            "service_manually_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.add_column(
        "delivery_providers",
        sa.Column(
            "weather_mode",
            sa.String(length=16),
            nullable=False,
            server_default="none",
        ),
    )
    op.create_check_constraint(
        "weather_mode_allowed",
        "delivery_providers",
        "weather_mode IN ('none', 'light', 'heavy', 'intense')",
    )

    connection = op.get_bind()
    connection.execute(
        text(
            """
            UPDATE delivery_providers p
            SET weather_mode = z.weather_mode,
                service_manually_enabled = z.service_manually_enabled
            FROM (
                SELECT DISTINCT ON (delivery_provider_id) id, delivery_provider_id,
                       weather_mode, service_manually_enabled
                FROM delivery_provider_zones
                WHERE is_active = true
                ORDER BY delivery_provider_id, priority ASC, created_at ASC
            ) z
            WHERE p.id = z.delivery_provider_id
            """
        )
    )

    op.drop_index(
        "uq_delivery_provider_zones_name_per_provider",
        table_name="delivery_provider_zones",
    )

    op.drop_index(
        "ix_delivery_provider_schedules_lookup",
        table_name="delivery_provider_schedules",
    )
    op.create_index(
        "ix_delivery_provider_schedules_lookup",
        "delivery_provider_schedules",
        ["delivery_provider_id", "schedule_kind", "day_of_week"],
        unique=False,
    )

    op.create_unique_constraint(
        op.f("uq_delivery_provider_pricing_configs_delivery_provider_id"),
        "delivery_provider_pricing_configs",
        ["delivery_provider_id"],
    )
    op.drop_constraint(
        op.f("uq_delivery_provider_pricing_configs_zone_id"),
        "delivery_provider_pricing_configs",
        type_="unique",
    )

    op.drop_constraint(
        op.f("fk_restaurant_delivery_providers_zone_id_delivery_provider_zones"),
        "restaurant_delivery_providers",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_delivery_provider_schedules_zone_id_delivery_provider_zones"),
        "delivery_provider_schedules",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_delivery_provider_pricing_configs_zone_id_delivery_provider_zones"),
        "delivery_provider_pricing_configs",
        type_="foreignkey",
    )

    op.drop_column("restaurant_delivery_providers", "zone_id")
    op.drop_column("delivery_provider_schedules", "zone_id")
    op.drop_column("delivery_provider_pricing_configs", "zone_id")

    op.drop_constraint(
        op.f("ck_delivery_provider_zones_weather_mode_allowed"),
        "delivery_provider_zones",
        type_="check",
    )
    op.drop_column("delivery_provider_zones", "service_manually_enabled")
    op.drop_column("delivery_provider_zones", "weather_mode")

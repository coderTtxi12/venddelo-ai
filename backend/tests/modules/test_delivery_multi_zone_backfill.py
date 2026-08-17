from sqlalchemy import create_engine, text

from app.modules.delivery_providers.multi_zone_backfill import cleanup_zoneless_provider_rows


def _engine():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE delivery_providers (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    slug TEXT,
                    created_at TEXT
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE delivery_provider_zones (
                    id TEXT PRIMARY KEY,
                    delivery_provider_id TEXT
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE delivery_provider_pricing_configs (
                    id TEXT PRIMARY KEY,
                    delivery_provider_id TEXT
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE delivery_provider_schedules (
                    id TEXT PRIMARY KEY,
                    delivery_provider_id TEXT
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE restaurant_delivery_providers (
                    id TEXT PRIMARY KEY,
                    restaurant_id TEXT,
                    delivery_provider_id TEXT
                )
                """
            )
        )
    return engine


def test_cleanup_drops_stub_pricing_schedules_and_duplicate_partnership():
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO delivery_providers (id, name, slug, created_at) VALUES
                ('real', 'Mexy', 'mexy', '2026-06-22'),
                ('stub', 'Mexy Reparto', 'mexy-reparto', '2026-06-23')
                """
            )
        )
        conn.execute(
            text("INSERT INTO delivery_provider_zones (id, delivery_provider_id) VALUES ('z1', 'real')")
        )
        conn.execute(
            text(
                """
                INSERT INTO delivery_provider_pricing_configs (id, delivery_provider_id) VALUES
                ('p-real', 'real'),
                ('p-stub', 'stub')
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO delivery_provider_schedules (id, delivery_provider_id) VALUES
                ('s-real', 'real'),
                ('s-stub', 'stub')
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO restaurant_delivery_providers
                    (id, restaurant_id, delivery_provider_id) VALUES
                ('link-real', 'wild', 'real'),
                ('link-stub', 'wild', 'stub')
                """
            )
        )

        cleanup_zoneless_provider_rows(conn)

        assert conn.execute(
            text("SELECT COUNT(*) FROM delivery_provider_pricing_configs WHERE delivery_provider_id = 'stub'")
        ).scalar() == 0
        assert conn.execute(
            text("SELECT COUNT(*) FROM delivery_provider_schedules WHERE delivery_provider_id = 'stub'")
        ).scalar() == 0
        assert conn.execute(
            text("SELECT id FROM restaurant_delivery_providers WHERE delivery_provider_id = 'stub'")
        ).first() is None
        assert conn.execute(
            text("SELECT id FROM restaurant_delivery_providers WHERE id = 'link-real'")
        ).scalar() == "link-real"
        assert conn.execute(
            text("SELECT COUNT(*) FROM delivery_provider_pricing_configs WHERE delivery_provider_id = 'real'")
        ).scalar() == 1


def test_cleanup_reassigns_lone_stub_partnership_to_zoned_mexy():
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO delivery_providers (id, name, slug, created_at) VALUES
                ('real', 'Mexy', 'mexy', '2026-06-22'),
                ('stub', 'Mexy Reparto', 'mexy-reparto', '2026-06-23')
                """
            )
        )
        conn.execute(
            text("INSERT INTO delivery_provider_zones (id, delivery_provider_id) VALUES ('z1', 'real')")
        )
        conn.execute(
            text(
                """
                INSERT INTO restaurant_delivery_providers
                    (id, restaurant_id, delivery_provider_id) VALUES
                ('link-stub', 'solo', 'stub')
                """
            )
        )

        cleanup_zoneless_provider_rows(conn)

        row = conn.execute(
            text(
                """
                SELECT delivery_provider_id FROM restaurant_delivery_providers WHERE id = 'link-stub'
                """
            )
        ).one()
        assert row[0] == "real"


def test_cleanup_leaves_zoneless_non_mexy_partnership():
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO delivery_providers (id, name, slug, created_at) VALUES
                ('other', 'Otra', 'otra-ciudad', '2026-06-22')
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO restaurant_delivery_providers
                    (id, restaurant_id, delivery_provider_id) VALUES
                ('link', 'r1', 'other')
                """
            )
        )

        cleanup_zoneless_provider_rows(conn)

        assert conn.execute(
            text("SELECT delivery_provider_id FROM restaurant_delivery_providers WHERE id = 'link'")
        ).scalar() == "other"

"""SQL helpers for public tracking broadcast."""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.modules.delivery_dispatch.tracking_view import tracking_eta_seconds
from tests.conftest import requires_db

_TRACKING_SQL = """
CREATE OR REPLACE FUNCTION public.tracking_eta_seconds(
    p_status text,
    p_rider_lat double precision,
    p_rider_lng double precision,
    p_pickup_lat double precision,
    p_pickup_lng double precision,
    p_dropoff_lat double precision,
    p_dropoff_lng double precision
) RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    dest_lat double precision;
    dest_lng double precision;
    d_phi double precision;
    d_lambda double precision;
    a double precision;
    meters double precision;
BEGIN
    IF p_rider_lat IS NULL OR p_rider_lng IS NULL THEN
        RETURN NULL;
    END IF;
    IF p_status = 'assigned' THEN
        IF p_pickup_lat IS NULL OR p_pickup_lng IS NULL THEN
            RETURN NULL;
        END IF;
        dest_lat := p_pickup_lat;
        dest_lng := p_pickup_lng;
    ELSIF p_status IN ('picked_up', 'in_transit') THEN
        dest_lat := p_dropoff_lat;
        dest_lng := p_dropoff_lng;
    ELSE
        RETURN NULL;
    END IF;
    d_phi := radians(dest_lat - p_rider_lat);
    d_lambda := radians(dest_lng - p_rider_lng);
    a := sin(d_phi / 2) ^ 2
        + cos(radians(p_rider_lat)) * cos(radians(dest_lat))
        * sin(d_lambda / 2) ^ 2;
    meters := 6371000 * 2 * atan2(sqrt(a), sqrt(1 - a));
    RETURN round(meters / 8.0)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.tracking_realtime_send(
    p_topic text,
    p_event text,
    p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF to_regprocedure('realtime.send(jsonb, text, text, boolean)') IS NULL THEN
        RETURN;
    END IF;
    BEGIN
        PERFORM realtime.send(p_payload, p_event, p_topic, false);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'tracking broadcast failed: %', SQLERRM;
    END;
END;
$$;

DO $$
BEGIN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.tracking_realtime_send(text, text, jsonb) FROM PUBLIC';
    BEGIN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.tracking_realtime_send(text, text, jsonb) FROM anon';
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    BEGIN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.tracking_realtime_send(text, text, jsonb) FROM authenticated';
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
END $$;
"""

_TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION public.delivery_dispatch_requests_tracking_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, pg_temp
AS $$
BEGIN
    PERFORM public.tracking_realtime_send(
        'tracking:' || NEW.tracking_token,
        'updated',
        '{}'::jsonb
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_dispatch_requests_tracking_updated
    ON public.delivery_dispatch_requests;
CREATE TRIGGER delivery_dispatch_requests_tracking_updated
AFTER INSERT OR UPDATE OF
    status,
    assigned_driver_id,
    customer_name,
    dropoff_lat,
    dropoff_lng,
    dropoff_address,
    payment_method,
    collect_cents,
    cash_denomination_cents,
    package_count,
    cancelled_at,
    picked_up_at,
    in_transit_at,
    delivered_at
ON public.delivery_dispatch_requests
FOR EACH ROW
EXECUTE FUNCTION public.delivery_dispatch_requests_tracking_updated();

CREATE OR REPLACE FUNCTION public.delivery_drivers_tracking_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, pg_temp
AS $$
DECLARE
    rec record;
    pickup_lat double precision;
    pickup_lng double precision;
    eta integer;
BEGIN
    IF NEW.last_lat IS NULL OR NEW.last_lng IS NULL THEN
        RETURN NEW;
    END IF;
    FOR rec IN
        SELECT r.tracking_token, r.status, r.dropoff_lat, r.dropoff_lng, r.restaurant_id
        FROM public.delivery_dispatch_requests r
        WHERE r.assigned_driver_id = NEW.id
          AND r.status IN ('assigned', 'picked_up', 'in_transit')
    LOOP
        SELECT rest.latitude, rest.longitude
          INTO pickup_lat, pickup_lng
        FROM public.restaurants rest
        WHERE rest.id = rec.restaurant_id;
        eta := public.tracking_eta_seconds(
            rec.status,
            NEW.last_lat,
            NEW.last_lng,
            pickup_lat,
            pickup_lng,
            rec.dropoff_lat,
            rec.dropoff_lng
        );
        PERFORM public.tracking_realtime_send(
            'tracking:' || rec.tracking_token,
            'location',
            jsonb_build_object(
                'latitude', NEW.last_lat,
                'longitude', NEW.last_lng,
                'eta_seconds', eta
            )
        );
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_drivers_tracking_location
    ON public.delivery_drivers;
CREATE TRIGGER delivery_drivers_tracking_location
AFTER UPDATE OF last_lat, last_lng
ON public.delivery_drivers
FOR EACH ROW
EXECUTE FUNCTION public.delivery_drivers_tracking_location();
"""


def _install_realtime_stub(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS realtime"))
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS realtime.send_log (
                    id bigserial PRIMARY KEY,
                    payload jsonb NOT NULL,
                    event text NOT NULL,
                    topic text NOT NULL,
                    is_private boolean NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE OR REPLACE FUNCTION realtime.send(
                    payload jsonb,
                    event text,
                    topic text,
                    is_private boolean
                ) RETURNS void
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    INSERT INTO realtime.send_log (payload, event, topic, is_private)
                    VALUES (payload, event, topic, is_private);
                END;
                $$
                """
            )
        )


def _clear_realtime_log(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE realtime.send_log"))


def _realtime_log(engine) -> list[dict]:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        rows = session.execute(
            text("SELECT payload, event, topic FROM realtime.send_log ORDER BY id")
        ).mappings()
        return [dict(row) for row in rows]


@pytest.fixture(autouse=True)
def _install_tracking_sql(engine):
    with engine.begin() as conn:
        conn.execute(text(_TRACKING_SQL))
        conn.execute(text(_TRIGGER_SQL))
    yield


STATUS = "in_transit"
RIDER = (19.4326, -99.1332)
DROPOFF = (19.44, -99.14)


@requires_db
def test_tracking_eta_seconds_sql_matches_python(engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        sql_value = session.execute(
            text(
                """
                SELECT public.tracking_eta_seconds(
                    :status, :rlat, :rlng, NULL, NULL, :dlat, :dlng
                )
                """
            ),
            {
                "status": STATUS,
                "rlat": RIDER[0],
                "rlng": RIDER[1],
                "dlat": DROPOFF[0],
                "dlng": DROPOFF[1],
            },
        ).scalar_one()
    python_value = tracking_eta_seconds(
        STATUS,
        rider_lat=RIDER[0],
        rider_lng=RIDER[1],
        pickup_lat=None,
        pickup_lng=None,
        dropoff_lat=DROPOFF[0],
        dropoff_lng=DROPOFF[1],
    )
    assert sql_value == python_value


@requires_db
def test_tracking_realtime_send_is_noop_without_realtime(engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        session.execute(
            text(
                "SELECT public.tracking_realtime_send('tracking:abc', 'updated', '{}'::jsonb)"
            )
        )
        session.commit()

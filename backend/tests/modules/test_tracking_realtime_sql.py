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
    PERFORM realtime.send(p_payload, p_event, p_topic, false);
END;
$$;
"""


@pytest.fixture(autouse=True)
def _install_tracking_sql(engine):
    with engine.begin() as conn:
        conn.execute(text(_TRACKING_SQL))
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

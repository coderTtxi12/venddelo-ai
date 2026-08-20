"""Trigger tests for public tracking Supabase realtime broadcast."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from tests.api.test_api_v1 import AUTH
from tests.api.test_delivery_partnerships import _create_mexy_provider
from tests.api.test_restaurant_dispatch_requests import (
    _activate_partnership,
    _create_restaurant,
    _dispatch_payload,
)
from tests.conftest import requires_db
from tests.modules.test_tracking_realtime_sql import (
    _TRACKING_SQL,
    _TRIGGER_SQL,
    _clear_realtime_log,
    _install_realtime_stub,
    _realtime_log,
)


@pytest.fixture(autouse=True)
def _clean_dispatch_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE delivery_credit_holds, delivery_dispatch_offers,
                         delivery_dispatch_requests, delivery_drivers,
                         restaurant_delivery_providers,
                         delivery_search_lead_times,
                         delivery_provider_assignment_settings,
                         delivery_provider_pricing_configs,
                         delivery_provider_payment_methods,
                         delivery_provider_schedules, delivery_provider_zones,
                         delivery_provider_members, delivery_providers,
                         restaurant_members, restaurants, users
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield


@pytest.fixture(autouse=True)
def _install_tracking_sql(engine):
    with engine.begin() as conn:
        conn.execute(text(_TRACKING_SQL))
        conn.execute(text(_TRIGGER_SQL))
    yield


@requires_db
def test_request_status_update_broadcasts_updated(engine, client):
    _install_realtime_stub(engine)
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="track-sql-upd")
    _activate_partnership(client, engine, restaurant_id)
    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    token = created.json()["tracking_token"]
    request_id = created.json()["id"]

    _clear_realtime_log(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE delivery_dispatch_requests SET status = 'searching' WHERE id = CAST(:id AS uuid)"
            ),
            {"id": request_id},
        )

    rows = _realtime_log(engine)
    assert any(
        row["topic"] == f"tracking:{token}" and row["event"] == "updated" for row in rows
    )


@requires_db
def test_next_attempt_update_does_not_broadcast(engine, client):
    _install_realtime_stub(engine)
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="track-sql-skip")
    _activate_partnership(client, engine, restaurant_id)
    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    _clear_realtime_log(engine)
    later = (datetime.now(UTC) + timedelta(minutes=5)).isoformat()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE delivery_dispatch_requests
                SET next_attempt_at = CAST(:ts AS timestamptz)
                WHERE id = CAST(:id AS uuid)
                """
            ),
            {"ts": later, "id": created.json()["id"]},
        )
    assert _realtime_log(engine) == []


@requires_db
def test_driver_gps_broadcasts_location_only_for_live_requests(engine, client):
    _install_realtime_stub(engine)
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="track-sql-gps")
    _activate_partnership(client, engine, restaurant_id)
    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    token = created.json()["tracking_token"]
    request_id = created.json()["id"]

    with engine.begin() as conn:
        driver_id = conn.execute(
            text(
                """
                INSERT INTO delivery_drivers (
                    delivery_provider_id, email, first_name, last_name, phone,
                    emergency_contact_name, emergency_contact_phone,
                    profile_photo_path, ine_document_path, license_document_path,
                    insurance_document_path, compartment_size, plate,
                    motorcycle_brand, motorcycle_color, status, is_online
                )
                SELECT delivery_provider_id, 'gps-rider@example.com', 'Ana', 'R', '5511111111',
                       'EC Name', '5599999999',
                       'p', 'i', 'l', 's', 'normal', 'ABC123', 'Honda', 'rojo',
                       'active', true
                FROM delivery_dispatch_requests
                WHERE id = CAST(:id AS uuid)
                RETURNING id
                """
            ),
            {"id": request_id},
        ).scalar_one()
        conn.execute(
            text(
                """
                UPDATE delivery_dispatch_requests
                SET status = 'in_transit', assigned_driver_id = :did
                WHERE id = CAST(:id AS uuid)
                """
            ),
            {"did": driver_id, "id": request_id},
        )

    _clear_realtime_log(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE delivery_drivers
                SET last_lat = 19.4326, last_lng = -99.1332
                WHERE id = :did
                """
            ),
            {"did": driver_id},
        )
    live_rows = [
        row
        for row in _realtime_log(engine)
        if row["event"] == "location" and row["topic"] == f"tracking:{token}"
    ]
    assert live_rows
    payload = live_rows[0]["payload"]
    assert payload["latitude"] == 19.4326
    assert payload["longitude"] == -99.1332
    assert payload["eta_seconds"] is not None

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE delivery_dispatch_requests
                SET status = 'delivered'
                WHERE id = CAST(:id AS uuid)
                """
            ),
            {"id": request_id},
        )
    _clear_realtime_log(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE delivery_drivers
                SET last_lat = 19.45, last_lng = -99.15
                WHERE id = :did
                """
            ),
            {"did": driver_id},
        )
    assert [row for row in _realtime_log(engine) if row["event"] == "location"] == []

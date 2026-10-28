from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.db.models.delivery import (
    DeliveryDispatchRequest,
    DeliveryDriver,
    DeliveryTerminalHold,
    RestaurantDeliveryProvider,
)
from tests.api.test_api_v1 import AUTH
from tests.api.test_delivery_manual_offer import _as_rider_a, _as_rider_b
from tests.api.test_delivery_partnerships import COVERED_LAT, COVERED_LNG
from tests.api.test_delivery_rider_offers import (
    _as_mexy,
    _as_owner,
    _as_rider,
    _setup_ready_fleet,
    _setup_ready_rider,
)
from tests.conftest import requires_db


@pytest.fixture(autouse=True)
def _clean_terminal_hold_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE delivery_terminal_holds, delivery_credit_holds,
                         delivery_dispatch_offers, delivery_dispatch_requests,
                         delivery_drivers, restaurant_delivery_providers,
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
    from app.modules.delivery_dispatch.notify import set_offer_notifier
    from app.modules.delivery_dispatch.tasks import stub_bus

    stub_bus.clear()
    set_offer_notifier(None)
    _as_owner()


def _insert_assigned_request(
    engine,
    *,
    restaurant_id: str,
    driver_id: str | uuid.UUID,
    payment_method: str,
    credit_held_cents: int | None = None,
) -> uuid.UUID:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    now = datetime.now(UTC)
    with factory() as session:
        link = session.scalar(
            select(RestaurantDeliveryProvider).where(
                RestaurantDeliveryProvider.restaurant_id == uuid.UUID(str(restaurant_id))
            )
        )
        assert link is not None
        request_id = uuid.uuid4()
        session.add(
            DeliveryDispatchRequest(
                id=request_id,
                restaurant_id=link.restaurant_id,
                delivery_provider_id=link.delivery_provider_id,
                zone_id=link.zone_id,
                customer_name="María López",
                customer_phone="+525512345678",
                dropoff_lat=COVERED_LAT,
                dropoff_lng=COVERED_LNG,
                dropoff_address="Centro Histórico, CDMX",
                payment_method=payment_method,
                collect_cents=25000,
                cash_denomination_cents=50000 if payment_method == "cash" else None,
                package_size="normal",
                package_count=1,
                ready_at=now,
                search_at=now,
                next_attempt_at=now,
                quoted_fee_cents=3500,
                status="assigned",
                assigned_driver_id=uuid.UUID(str(driver_id)),
                tracking_token=secrets.token_hex(24),
                short_id=secrets.token_hex(3)[:5].upper(),
            )
        )
        if credit_held_cents is not None:
            driver = session.get(DeliveryDriver, uuid.UUID(str(driver_id)))
            assert driver is not None
            driver.credit_held_cents = credit_held_cents
        session.commit()
        return request_id


def _pickup(client, request_id: uuid.UUID):
    return client.post(
        f"/api/v1/rider/me/assignments/{request_id}/picked-up",
        headers=AUTH,
    )


def _hold_for(session, request_id: uuid.UUID) -> DeliveryTerminalHold | None:
    return session.scalar(
        select(DeliveryTerminalHold).where(DeliveryTerminalHold.request_id == request_id)
    )


@requires_db
def test_pickup_card_terminal_creates_hold_cash_does_not(client, engine):
    restaurant_id, driver_id = _setup_ready_rider(client, engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    cash_id = _insert_assigned_request(
        engine,
        restaurant_id=restaurant_id,
        driver_id=driver_id,
        payment_method="cash",
        credit_held_cents=25000,
    )
    _as_rider()
    cash_pickup = _pickup(client, cash_id)
    assert cash_pickup.status_code == 200, cash_pickup.text
    with factory() as session:
        assert _hold_for(session, cash_id) is None
        driver = session.get(DeliveryDriver, uuid.UUID(driver_id))
        assert driver is not None
        assert driver.credit_held_cents == 25000

    terminal_id = _insert_assigned_request(
        engine,
        restaurant_id=restaurant_id,
        driver_id=driver_id,
        payment_method="card_terminal",
    )
    with factory() as session:
        driver = session.get(DeliveryDriver, uuid.UUID(driver_id))
        assert driver is not None
        held_before_terminal = driver.credit_held_cents
    picked = _pickup(client, terminal_id)
    assert picked.status_code == 200, picked.text
    with factory() as session:
        hold = _hold_for(session, terminal_id)
        assert hold is not None
        assert hold.status == "held"
        assert hold.driver_id == uuid.UUID(driver_id)
        driver = session.get(DeliveryDriver, uuid.UUID(driver_id))
        assert driver is not None
        assert driver.credit_held_cents == held_before_terminal


@requires_db
def test_hold_survives_deliver_and_stays_on_original_rider_after_reassign(client, engine):
    restaurant_id, driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=2,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="terminal-reassign",
    )
    _as_rider_a()
    client.get("/api/v1/rider/me", headers=AUTH)
    _as_rider_b()
    client.get("/api/v1/rider/me", headers=AUTH)

    first_id = _insert_assigned_request(
        engine,
        restaurant_id=restaurant_id,
        driver_id=driver_ids[0],
        payment_method="card_terminal",
    )
    _as_rider_a()
    assert _pickup(client, first_id).status_code == 200
    in_transit = client.post(
        f"/api/v1/rider/me/assignments/{first_id}/in-transit",
        headers=AUTH,
    )
    assert in_transit.status_code == 200, in_transit.text
    delivered = client.post(
        f"/api/v1/rider/me/assignments/{first_id}/delivered",
        headers=AUTH,
    )
    assert delivered.status_code == 200, delivered.text

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        hold = _hold_for(session, first_id)
        assert hold is not None
        assert hold.status == "held"
        assert hold.driver_id == driver_ids[0]

    second_id = _insert_assigned_request(
        engine,
        restaurant_id=restaurant_id,
        driver_id=driver_ids[0],
        payment_method="card_terminal",
    )
    _as_rider_a()
    assert _pickup(client, second_id).status_code == 200

    _as_mexy()
    offer_b = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{second_id}/manual-offer",
        json={"driver_id": str(driver_ids[1])},
        headers=AUTH,
    )
    assert offer_b.status_code == 201, offer_b.text
    _as_rider_b()
    swapped = client.post(
        f"/api/v1/rider/me/offers/{offer_b.json()['id']}/accept",
        headers=AUTH,
    )
    assert swapped.status_code == 200, swapped.text
    with factory() as session:
        row = session.get(DeliveryDispatchRequest, second_id)
        assert row is not None
        assert row.status == "assigned"
        assert row.assigned_driver_id == driver_ids[1]
        hold = _hold_for(session, second_id)
        assert hold is not None
        assert hold.driver_id == driver_ids[0]

    picked_b = _pickup(client, second_id)
    assert picked_b.status_code == 200, picked_b.text
    with factory() as session:
        holds = list(
            session.scalars(
                select(DeliveryTerminalHold).where(DeliveryTerminalHold.request_id == second_id)
            ).all()
        )
        assert len(holds) == 1
        assert holds[0].driver_id == driver_ids[0]
        assert holds[0].status == "held"


@requires_db
def test_list_and_confirm_terminal_return(client, engine):
    restaurant_id, driver_id = _setup_ready_rider(client, engine)
    request_id = _insert_assigned_request(
        engine,
        restaurant_id=restaurant_id,
        driver_id=driver_id,
        payment_method="card_terminal",
    )
    _as_rider()
    assert _pickup(client, request_id).status_code == 200

    _as_owner()
    listed = client.get(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert listed.status_code == 200, listed.text
    row = next(item for item in listed.json() if item["id"] == str(request_id))
    assert row["terminal_hold_status"] == "held"
    assert row["terminal_holder"]["driver_id"] == driver_id

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        driver = session.get(DeliveryDriver, uuid.UUID(driver_id))
        assert driver is not None
        held_before = driver.credit_held_cents

    confirmed = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/confirm-terminal-return",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["terminal_hold_status"] == "released"
    assert confirmed.json()["terminal_holder"]["driver_id"] == driver_id

    again = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/confirm-terminal-return",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert again.status_code == 400

    with factory() as session:
        driver = session.get(DeliveryDriver, uuid.UUID(driver_id))
        assert driver is not None
        assert driver.credit_held_cents == held_before


@requires_db
def test_confirm_after_reassign_releases_original_holder(client, engine):
    restaurant_id, driver_ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=2,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="terminal-confirm-reassign",
    )
    _as_rider_a()
    client.get("/api/v1/rider/me", headers=AUTH)
    _as_rider_b()
    client.get("/api/v1/rider/me", headers=AUTH)

    request_id = _insert_assigned_request(
        engine,
        restaurant_id=restaurant_id,
        driver_id=driver_ids[0],
        payment_method="card_terminal",
    )
    _as_rider_a()
    assert _pickup(client, request_id).status_code == 200

    _as_mexy()
    offer_b = client.post(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/manual-offer",
        json={"driver_id": str(driver_ids[1])},
        headers=AUTH,
    )
    assert offer_b.status_code == 201, offer_b.text
    _as_rider_b()
    swapped = client.post(
        f"/api/v1/rider/me/offers/{offer_b.json()['id']}/accept",
        headers=AUTH,
    )
    assert swapped.status_code == 200, swapped.text

    _as_owner()
    confirmed = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/confirm-terminal-return",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["terminal_hold_status"] == "released"
    assert confirmed.json()["terminal_holder"]["driver_id"] == str(driver_ids[0])

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        hold = _hold_for(session, request_id)
        assert hold is not None
        assert hold.status == "released"
        assert hold.driver_id == driver_ids[0]


@requires_db
def test_rider_me_lists_hold_after_deliver(client, engine):
    restaurant_id, driver_id = _setup_ready_rider(client, engine)
    request_id = _insert_assigned_request(
        engine,
        restaurant_id=restaurant_id,
        driver_id=driver_id,
        payment_method="card_terminal",
    )
    _as_rider()
    assert _pickup(client, request_id).status_code == 200
    in_transit = client.post(
        f"/api/v1/rider/me/assignments/{request_id}/in-transit",
        headers=AUTH,
    )
    assert in_transit.status_code == 200, in_transit.text
    delivered = client.post(
        f"/api/v1/rider/me/assignments/{request_id}/delivered",
        headers=AUTH,
    )
    assert delivered.status_code == 200, delivered.text

    me = client.get("/api/v1/rider/me", headers=AUTH)
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["assignments"] == []
    assert len(body["terminal_holds"]) == 1
    hold = body["terminal_holds"][0]
    assert hold["request_id"] == str(request_id)
    assert hold["restaurant_id"] == restaurant_id
    assert hold["restaurant_name"]
    assert hold["short_id"]

    history = client.get("/api/v1/rider/me/history", headers=AUTH)
    assert history.status_code == 200, history.text
    active = history.json()["active_terminal_holds"]
    assert [item["request_id"] for item in active] == [str(request_id)]

    _as_owner()
    confirmed = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/confirm-terminal-return",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert confirmed.status_code == 200, confirmed.text

    _as_rider()
    me = client.get("/api/v1/rider/me", headers=AUTH)
    assert me.json()["terminal_holds"] == []
    history = client.get("/api/v1/rider/me/history", headers=AUTH)
    assert history.json()["active_terminal_holds"] == []


@requires_db
def test_monitor_lists_terminal_hold_after_deliver(client, engine):
    restaurant_id, driver_id = _setup_ready_rider(client, engine)
    request_id = _insert_assigned_request(
        engine,
        restaurant_id=restaurant_id,
        driver_id=driver_id,
        payment_method="card_terminal",
    )
    _as_rider()
    assert _pickup(client, request_id).status_code == 200
    in_transit = client.post(
        f"/api/v1/rider/me/assignments/{request_id}/in-transit",
        headers=AUTH,
    )
    assert in_transit.status_code == 200, in_transit.text
    delivered = client.post(
        f"/api/v1/rider/me/assignments/{request_id}/delivered",
        headers=AUTH,
    )
    assert delivered.status_code == 200, delivered.text

    _as_mexy()
    monitor = client.get("/api/v1/delivery-providers/me/dispatch-monitor", headers=AUTH)
    assert monitor.status_code == 200, monitor.text
    body = monitor.json()
    assert body["metrics"]["terminal_holds_active"] == 1
    holds = body["terminal_holds"]
    assert len(holds) == 1
    assert holds[0]["request_id"] == str(request_id)
    assert holds[0]["request_status"] == "delivered"
    assert holds[0]["driver_id"] == driver_id
    assert holds[0]["driver_name"]
    assert holds[0]["restaurant_name"]
    assert holds[0]["short_id"]

    _as_owner()
    confirmed = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/confirm-terminal-return",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert confirmed.status_code == 200, confirmed.text

    _as_mexy()
    after = client.get("/api/v1/delivery-providers/me/dispatch-monitor", headers=AUTH)
    assert after.status_code == 200, after.text
    assert after.json()["metrics"]["terminal_holds_active"] == 0
    assert after.json()["terminal_holds"] == []

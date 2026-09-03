import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.db.models.delivery import DeliveryDispatchRequest, DeliveryDriver
from tests.api.test_api_v1 import AUTH, OTHER, OWNER
from tests.api.test_delivery_partnerships import (
    COVERED_LAT,
    COVERED_LNG,
    MEXY_USER,
    _create_mexy_provider,
)
from tests.conftest import requires_db


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
                         order_items, orders,
                         restaurant_members, restaurants, users
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield


def _create_restaurant(client, *, subdomain: str) -> str:
    response = client.post(
        "/api/v1/restaurants",
        json={
            "name": "Dispatch Bistro",
            "subdomain": subdomain,
            "delivery_enabled": True,
            "latitude": COVERED_LAT,
            "longitude": COVERED_LNG,
        },
        headers=AUTH,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _activate_partnership(client, engine, restaurant_id: str) -> None:
    from app.api.deps import get_auth
    from app.core.security import AuthenticatedUser, AuthPort
    from app.main import app

    class MexyAuth(AuthPort):
        def verify_token(self, token: str) -> AuthenticatedUser:
            return AuthenticatedUser(id=MEXY_USER, email="mexy@example.com")

    app.dependency_overrides[get_auth] = MexyAuth
    listed = client.get("/api/v1/delivery-providers/me/partnership-requests", headers=AUTH)
    link_id = next(
        item["id"] for item in listed.json() if item["restaurant"]["id"] == restaurant_id
    )
    accepted = client.post(
        f"/api/v1/delivery-providers/me/partnership-requests/{link_id}/accept",
        headers=AUTH,
    )
    assert accepted.status_code == 200
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE delivery_provider_schedules
                SET opens_at = TIME '00:00', closes_at = TIME '23:59'
                """
            )
        )
    app.dependency_overrides[get_auth] = lambda: __import__(
        "tests.api.test_api_v1", fromlist=["FakeAuth"]
    ).FakeAuth(OWNER)


def _dispatch_payload(**overrides):
    payload = {
        "customer_name": "María López",
        "customer_phone": "+525512345678",
        "dropoff_lat": COVERED_LAT,
        "dropoff_lng": COVERED_LNG,
        "dropoff_address": "Centro Histórico, CDMX",
        "payment_method": "cash",
        "collect_cents": 25000,
        "cash_denomination_cents": 50000,
        "package_size": "normal",
        "package_count": 1,
        "prep_minutes": 5,
    }
    payload.update(overrides)
    return payload


@requires_db
def test_create_requires_active_partnership(client, engine):
    restaurant_id = _create_restaurant(client, subdomain="dispatch-no-partner")

    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )

    assert response.status_code == 403
    assert response.json()["error"]["message"] == "No tienes un repartidor activo"


@requires_db
def test_create_dispatch_persists_quote_and_immediate_search(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-active")
    _activate_partnership(client, engine, restaurant_id)

    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "searching"
    assert len(body["tracking_token"]) >= 48
    assert body["quoted_fee_cents"] > 0
    assert body["search_at"] is not None
    assert body["short_id"]
    assert len(body["short_id"]) == 5
    assert body["short_id"].isupper()
    assert body["rider"] is None

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        row = session.scalar(
            select(DeliveryDispatchRequest).where(
                DeliveryDispatchRequest.id == uuid.UUID(body["id"])
            )
        )
        assert row is not None
        assert row.search_at is not None


@requires_db
def test_create_dispatch_publishes_restaurant_realtime_event(client, engine, monkeypatch):
    from app.infra.realtime import restaurant_dispatch_hub as restaurant_hub_module

    published: list[dict] = []

    def capture_publish(restaurant_id, payload):
        published.append({"restaurant_id": str(restaurant_id), **payload})

    monkeypatch.setattr(
        restaurant_hub_module.get_restaurant_dispatch_realtime_hub(),
        "publish_sync",
        capture_publish,
    )

    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-publish")
    _activate_partnership(client, engine, restaurant_id)
    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )

    assert response.status_code == 201, response.text
    assert published
    assert published[0]["type"] == "dispatch.updated"
    assert published[0]["restaurant_id"] == restaurant_id


@requires_db
def test_dispatch_events_requires_bearer(client, engine):
    restaurant_id = _create_restaurant(client, subdomain="dispatch-sse-401")
    response = client.get(f"/api/v1/restaurants/{restaurant_id}/dispatch/events")
    assert response.status_code == 401


@requires_db
def test_dispatch_events_forbidden_for_other_user(client, engine):
    from app.api.deps import get_auth
    from app.main import app
    from tests.api.test_api_v1 import FakeAuth

    restaurant_id = _create_restaurant(client, subdomain="dispatch-sse-403")
    app.dependency_overrides[get_auth] = lambda: FakeAuth(OTHER)
    try:
        response = client.get(
            f"/api/v1/restaurants/{restaurant_id}/dispatch/events",
            headers=AUTH,
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides[get_auth] = lambda: FakeAuth(OWNER)


@requires_db
def test_dispatch_events_streams_published_event(client, engine):
    import json
    import threading
    import time

    from app.infra.realtime.restaurant_dispatch_hub import get_restaurant_dispatch_realtime_hub

    restaurant_id = _create_restaurant(client, subdomain="dispatch-sse-ok")
    rid = uuid.UUID(restaurant_id)
    hub = get_restaurant_dispatch_realtime_hub()

    def publish_soon() -> None:
        time.sleep(0.15)
        hub.publish_sync(rid, {"type": "dispatch.updated"})

    worker = threading.Thread(target=publish_soon)
    worker.start()
    with client.stream(
        "GET",
        f"/api/v1/restaurants/{restaurant_id}/dispatch/events",
        headers=AUTH,
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        body = b""
        for chunk in response.iter_bytes():
            body += chunk
            if b"event: dispatch.updated" in body:
                break
    worker.join(timeout=2)
    text = body.decode("utf-8")
    assert "event: dispatch.updated" in text
    assert json.dumps({"type": "dispatch.updated"}) in text


@requires_db
def test_create_accepts_custom_prep_time_below_sixty(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-custom-prep")
    _activate_partnership(client, engine, restaurant_id)

    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(prep_minutes=7),
        headers=AUTH,
    )

    assert response.status_code == 201, response.text


@requires_db
def test_create_rejects_prep_time_sixty_or_more(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-bad-prep")
    _activate_partnership(client, engine, restaurant_id)

    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(prep_minutes=60),
        headers=AUTH,
    )

    assert response.status_code == 422


@requires_db
def test_unknown_tracking_token_returns_404(client):
    response = client.get("/api/v1/public/dispatch-tracking/missing-token")
    assert response.status_code == 404


@requires_db
def test_invalid_maps_url_returns_400(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-bad-maps")
    _activate_partnership(client, engine, restaurant_id)

    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(
            dropoff_lat=None,
            dropoff_lng=None,
            dropoff_maps_url="https://example.com/not-a-map",
        ),
        headers=AUTH,
    )

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "No se pudo leer la ubicación del enlace"


@requires_db
def test_lead_times_and_payment_patch_while_searching(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-patch")
    _activate_partnership(client, engine, restaurant_id)

    lead_times = client.get(
        "/api/v1/restaurants/me/dispatch-lead-times",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert lead_times.status_code == 200
    assert [row["prep_minutes"] for row in lead_times.json()] == [5, 10, 15, 20, 30]

    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]

    patched = client.patch(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}",
        params={"restaurant_id": restaurant_id},
        json={"payment_method": "transfer", "collect_cents": 0},
        headers=AUTH,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["payment_method"] == "transfer"
    assert patched.json()["collect_cents"] == 0
    assert patched.json()["cash_denomination_cents"] is None

    retry = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/retry",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert retry.status_code == 400


@requires_db
def test_cancel_and_public_tracking_hide_private_fields(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-tracking")
    _activate_partnership(client, engine, restaurant_id)
    create_response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert create_response.status_code == 201, create_response.text
    created = create_response.json()

    cancelled = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{created['id']}/cancel",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    tracking = client.get(f"/api/v1/public/dispatch-tracking/{created['tracking_token']}")
    assert tracking.status_code == 200
    body = tracking.json()
    assert body["status"] == "cancelled"
    assert body["dropoff"]["address"] == "Centro Histórico, CDMX"
    assert body["short_id"] == created["short_id"]
    assert body["rider"] is None
    assert body["package_count"] == 1
    assert body["payment_method"] == "cash"
    assert body["collect_cents"] == created["collect_cents"] + created["quoted_fee_cents"]
    assert body["cash_denomination_cents"] == 50000
    assert body["pickup"]["name"] == "Dispatch Bistro"
    assert body["pickup"]["latitude"] == COVERED_LAT
    assert body["pickup"]["longitude"] == COVERED_LNG
    assert body["restaurant_name"] == "Dispatch Bistro"
    assert body["customer_name"] == "María López"
    assert "customer_phone" not in body
    assert "tracking_token" not in body
    assert "plate" not in body


@requires_db
def test_cancel_rejected_when_rider_already_assigned(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-no-cancel-assigned")
    _activate_partnership(client, engine, restaurant_id)
    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    request_id = uuid.UUID(created.json()["id"])

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        row = session.get(DeliveryDispatchRequest, request_id)
        assert row is not None
        row.status = "assigned"
        session.commit()

    cancelled = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/cancel",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert cancelled.status_code == 400
    assert "repartidor asignado" in cancelled.json()["error"]["message"].lower()


@requires_db
def test_list_includes_assigned_rider_public_fields(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-list-rider")
    _activate_partnership(client, engine, restaurant_id)
    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    request_id = uuid.UUID(created.json()["id"])

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        row = session.get(DeliveryDispatchRequest, request_id)
        assert row is not None
        driver = DeliveryDriver(
            delivery_provider_id=row.delivery_provider_id,
            email="juan.rider@example.com",
            first_name="Juan",
            last_name="Pérez",
            phone="+525511112233",
            emergency_contact_name="María Pérez",
            emergency_contact_phone="+525598765432",
            profile_photo_path="drivers/photo.webp",
            ine_document_path="drivers/ine.webp",
            license_document_path="drivers/licencia.webp",
            insurance_document_path="drivers/seguro.webp",
            compartment_size="normal",
            plate="ABC123",
            motorcycle_brand="Italika",
            motorcycle_color="Rojo",
            status="active",
        )
        session.add(driver)
        session.flush()
        row.assigned_driver_id = driver.id
        row.status = "assigned"
        session.commit()

    listed = client.get(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        headers=AUTH,
    )
    assert listed.status_code == 200, listed.text
    body = next(item for item in listed.json() if item["id"] == str(request_id))
    rider = body["rider"]
    assert rider is not None
    assert rider["first_name"] == "Juan"
    assert rider["plate_suffix"] == "123"
    assert rider["vehicle_type"] == "moto"
    assert rider["motorcycle_brand"] == "Italika"
    assert rider["motorcycle_color"] == "Rojo"
    assert rider["phone"] == "+525511112233"
    assert "last_name" not in rider
    assert "plate" not in rider or rider.get("plate") is None
    assert "emergency_contact_phone" not in rider


@requires_db
def test_public_tracking_omits_collect_for_transfer(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-transfer-track")
    _activate_partnership(client, engine, restaurant_id)
    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(
            payment_method="transfer",
            collect_cents=0,
            cash_denomination_cents=None,
        ),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text

    tracking = client.get(f"/api/v1/public/dispatch-tracking/{created.json()['tracking_token']}")
    assert tracking.status_code == 200
    body = tracking.json()
    assert body["payment_method"] == "transfer"
    assert body["collect_cents"] is None
    assert body["cash_denomination_cents"] is None
    assert body["package_count"] == 1
    assert body["rider"] is None
    assert body["restaurant_name"] == "Dispatch Bistro"
    assert body["customer_name"] == "María López"


@requires_db
def test_public_tracking_keeps_names_when_delivered(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-delivered-track")
    _activate_partnership(client, engine, restaurant_id)
    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    request_id = uuid.UUID(created.json()["id"])

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        row = session.get(DeliveryDispatchRequest, request_id)
        assert row is not None
        row.status = "delivered"
        session.commit()

    tracking = client.get(f"/api/v1/public/dispatch-tracking/{created.json()['tracking_token']}")
    assert tracking.status_code == 200
    body = tracking.json()
    assert body["status"] == "delivered"
    assert body["restaurant_name"] == "Dispatch Bistro"
    assert body["customer_name"] == "María López"
    assert body["dropoff"]["address"] == "Centro Histórico, CDMX"
    assert "customer_phone" not in body


def test_public_plate_suffix_uses_last_three_alnum():
    from app.modules.delivery_dispatch.tracking_view import public_plate_suffix

    assert public_plate_suffix("ABC123") == "123"
    assert public_plate_suffix("ab-12-3") == "123"
    assert public_plate_suffix("12") == "12"
    assert public_plate_suffix("   ") == ""


def _create_delivery_order(engine, restaurant_id: str, **overrides):
    from app.db.uow import SqlAlchemyUnitOfWork
    from app.modules.orders.schemas import OrderCreate

    payload = {
        "restaurant_id": uuid.UUID(restaurant_id),
        "type": "delivery",
        "customer_name": "María López",
        "customer_phone": "+525512345678",
        "payment_method": "cash",
        "subtotal_cents": 18000,
        "total_cents": 25777,
        "delivery_address": "Centro Histórico, CDMX",
        "delivery_latitude": COVERED_LAT,
        "delivery_longitude": COVERED_LNG,
        "delivery_fee_cents": 7777,
        "cash_denomination_cents": 50000,
        "note": "Ref. pedido #A1B2C3D4 | sin cebolla",
        "items": [],
    }
    payload.update(overrides)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        order = uow.orders.add(OrderCreate(**payload))
        uow.commit()
        return order


@requires_db
def test_create_dispatch_from_order_reuses_display_id_and_quoted_fee(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-order-id")
    _activate_partnership(client, engine, restaurant_id)
    order = _create_delivery_order(engine, restaurant_id)

    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(order_id=str(order.id)),
        headers=AUTH,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["short_id"] == "A1B2C"
    assert body["quoted_fee_cents"] == 7777
    assert body["order_id"] == str(order.id)

    listed = client.get(
        f"/api/v1/restaurants/{restaurant_id}/orders",
        headers=AUTH,
    )
    assert listed.status_code == 200
    item = next(row for row in listed.json()["items"] if row["id"] == str(order.id))
    assert item["dispatch"]["short_id"] == "A1B2C"
    assert item["dispatch"]["tracking_token"] == body["tracking_token"]
    assert item["dispatch"]["status"] == body["status"]


@requires_db
def test_create_dispatch_from_order_historical_waived_fee_fallback(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-order-waived")
    _activate_partnership(client, engine, restaurant_id)
    order = _create_delivery_order(
        engine,
        restaurant_id,
        delivery_fee_cents=0,
        coupon_waived_delivery_cents=7777,
        total_cents=18000,
    )

    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(order_id=str(order.id)),
        headers=AUTH,
    )

    assert response.status_code == 201, response.text
    assert response.json()["quoted_fee_cents"] == 7777


@requires_db
def test_create_dispatch_from_order_requotes_when_pin_moves(client, engine):
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-order-move")
    _activate_partnership(client, engine, restaurant_id)
    order = _create_delivery_order(engine, restaurant_id)

    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(
            order_id=str(order.id),
            dropoff_lat=COVERED_LAT + 0.002,
            dropoff_lng=COVERED_LNG + 0.002,
        ),
        headers=AUTH,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["short_id"] == "A1B2C"
    assert body["quoted_fee_cents"] != 7777
    assert body["quoted_fee_cents"] > 0

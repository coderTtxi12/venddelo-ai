from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.db.models.delivery import (
    DeliveryDispatchAssignmentEvent,
    DeliveryDispatchOffer,
    DeliveryDispatchRequest,
    DeliveryProviderAssignmentSettings,
)
from app.main import app
from tests.api.test_api_v1 import AUTH, OTHER
from tests.api.test_delivery_rider_offers import (
    _as_mexy,
    _as_rider,
    _Auth,
    _create_and_offer,
    _create_dispatch_request,
    _setup_ready_fleet,
    _setup_ready_rider,
)
from tests.conftest import requires_db


@pytest.fixture(autouse=True)
def _clean(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE delivery_credit_holds, delivery_dispatch_offers,
                         delivery_dispatch_assignment_events,
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
    from app.modules.delivery_dispatch.tasks import stub_bus

    stub_bus.clear()


@requires_db
def test_search_miss_records_blockers(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=0,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="log-miss",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        row = session.scalar(
            select(DeliveryDispatchAssignmentEvent).where(
                DeliveryDispatchAssignmentEvent.request_id == request_id
            )
        )
    assert row is not None
    assert row.kind == "searched"
    assert row.title == "Buscó rider"
    assert row.detail == "No hay repartidores dados de alta."
    assert row.next_attempt_at is not None


@requires_db
def test_case_a_records_nearest_copy(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="log-near",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        row = session.scalar(
            select(DeliveryDispatchAssignmentEvent).where(
                DeliveryDispatchAssignmentEvent.request_id == request_id
            )
        )
        offer = session.scalar(
            select(DeliveryDispatchOffer).where(DeliveryDispatchOffer.request_id == request_id)
        )
    assert offer is not None
    assert row is not None
    assert row.kind == "offered"
    assert row.detail == "El más cercano al restaurante"
    assert row.title.startswith("Ofertó a ")


@requires_db
def test_expire_records_no_response(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="log-expire",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        offer = session.scalar(
            select(DeliveryDispatchOffer).where(DeliveryDispatchOffer.request_id == request_id)
        )
        assert offer is not None
        handle_task(
            session,
            {
                "kind": "expire_offer",
                "request_id": str(request_id),
                "offer_id": str(offer.id),
            },
            now=now + timedelta(seconds=120),
        )
        session.commit()
        kinds = list(
            session.scalars(
                select(DeliveryDispatchAssignmentEvent.kind)
                .where(DeliveryDispatchAssignmentEvent.request_id == request_id)
                .order_by(DeliveryDispatchAssignmentEvent.created_at)
            )
        )
    assert "expired" in kinds


@requires_db
def test_timeout_records_timed_out(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=0,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="log-timeout",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    now = datetime.now(UTC)
    with factory() as session:
        request = session.get(DeliveryDispatchRequest, request_id)
        assert request is not None
        settings = session.get(DeliveryProviderAssignmentSettings, request.delivery_provider_id)
        assert settings is not None
        settings.assignment_timeout_seconds = 1
        request.search_at = now - timedelta(seconds=5)
        session.commit()
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        row = session.scalar(
            select(DeliveryDispatchAssignmentEvent).where(
                DeliveryDispatchAssignmentEvent.request_id == request_id,
                DeliveryDispatchAssignmentEvent.kind == "timed_out",
            )
        )
    assert row is not None
    assert row.title == "Se agotó la búsqueda"


@requires_db
def test_assignment_log_get_returns_events_and_404_cross_company(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="log-get",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()

    _as_mexy()
    ok = client.get(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/assignment-log",
        headers=AUTH,
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["request_id"] == str(request_id)
    assert len(body["events"]) >= 1
    assert body["events"][0]["title"]
    assert "detail" in body["events"][0]
    assert body["next_attempt_at"] is not None or body["events"]

    app.dependency_overrides[get_auth] = lambda: _Auth(OTHER, "otro@example.com")
    missing = client.get(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/assignment-log",
        headers=AUTH,
    )
    assert missing.status_code in {401, 404}


@requires_db
def test_assignment_log_caps_at_50(client, engine):
    restaurant_id, _ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=0,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="log-cap",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    from app.db.models.delivery import DeliveryDispatchRequest
    from app.modules.delivery_dispatch.assignment_log import record_assignment_event

    with factory() as session:
        request = session.get(DeliveryDispatchRequest, request_id)
        assert request is not None
        for index in range(55):
            record_assignment_event(
                session,
                request,
                kind="searched",
                tone="warn",
                title="Buscó rider",
                detail=str(index),
            )
        session.commit()

    _as_mexy()
    ok = client.get(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/assignment-log",
        headers=AUTH,
    )
    assert ok.status_code == 200
    events = ok.json()["events"]
    assert len(events) == 50
    assert events[0]["detail"] == "5"
    assert events[-1]["detail"] == "54"


@requires_db
def test_reject_records_assignment_event(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)

    _as_rider()
    rejected = client.post(
        f"/api/v1/rider/me/offers/{offer_id}/reject",
        headers=AUTH,
    )
    assert rejected.status_code == 200, rejected.text

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        kinds = list(
            session.scalars(
                select(DeliveryDispatchAssignmentEvent.kind)
                .where(DeliveryDispatchAssignmentEvent.request_id == request_id)
                .order_by(DeliveryDispatchAssignmentEvent.created_at)
            )
        )
    assert "rejected" in kinds

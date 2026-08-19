from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.db.models.delivery import (
    DeliveryDispatchAssignmentEvent,
    DeliveryDispatchOffer,
    DeliveryDispatchRequest,
    DeliveryProviderAssignmentSettings,
)
from tests.api.test_delivery_rider_offers import (
    _create_dispatch_request,
    _setup_ready_fleet,
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

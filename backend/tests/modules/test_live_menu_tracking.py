"""Live-menu delivery orders must get a tracking stub even when external_id is absent."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.db.models.delivery import DeliveryDispatchRequest
from app.modules.delivery_dispatch.service import RestaurantDispatchService
from app.modules.orders.schemas import OrderDTO
from app.modules.public.delivery_quote_service import ResolvedDeliveryQuote


def _live_menu_order(**overrides: object) -> OrderDTO:
    now = datetime.now(UTC)
    data: dict[str, object] = {
        "id": uuid.uuid4(),
        "restaurant_id": uuid.uuid4(),
        "type": "delivery",
        "customer_name": "Ana",
        "customer_phone": "+525511111111",
        "payment_method": "cash",
        "subtotal_cents": 10000,
        "total_cents": 14500,
        "status": "pending",
        "delivery_address": "Centro, CDMX",
        "delivery_latitude": 19.43,
        "delivery_longitude": -99.13,
        "delivery_fee_cents": 4500,
        "coupon_waived_delivery_cents": 0,
        "cash_denomination_cents": 20000,
        "created_at": now,
        "updated_at": now,
    }
    data.update(overrides)
    return OrderDTO(**data)


def _service() -> tuple[RestaurantDispatchService, dict[str, DeliveryDispatchRequest]]:
    session = MagicMock()
    service = RestaurantDispatchService(session, provider_repo=MagicMock())
    service._existing_order_dispatch = lambda *_args, **_kwargs: None  # type: ignore[method-assign]
    service._active_partnership = lambda _restaurant_id: SimpleNamespace(  # type: ignore[method-assign]
        delivery_provider_id=uuid.uuid4(),
        zone_id=uuid.uuid4(),
    )
    service._quotes.quote_delivery = lambda *_args, **_kwargs: ResolvedDeliveryQuote(  # type: ignore[method-assign]
        available=True,
        reason=None,
        delivery_fee_cents=9999,
        inside_polygon=True,
        distance_km=2.0,
        provider_name="Mexy",
        partnership_status="active",
        mexy_fee_cents=800,
    )
    captured: dict[str, DeliveryDispatchRequest] = {}

    def flush(row: DeliveryDispatchRequest) -> SimpleNamespace:
        captured["row"] = row
        return SimpleNamespace(tracking_token=row.tracking_token)

    service._flush_request = flush  # type: ignore[method-assign]
    return service, captured


def test_live_menu_delivery_order_gets_tracking_token(monkeypatch):
    monkeypatch.setattr(
        "app.modules.delivery_dispatch.service.claim_dispatch_short_id",
        lambda _session, _preferred: "TRK1",
    )
    service, captured = _service()
    order = _live_menu_order()
    restaurant = SimpleNamespace(id=order.restaurant_id)

    result = service.create_accepted_for_order(restaurant, order)

    row = captured["row"]
    assert result is not None
    assert result.tracking_token == row.tracking_token
    assert len(row.tracking_token) >= 48
    assert row.status == "accepted"
    # Live-menu orders lock the fee already charged to the customer.
    assert row.quoted_fee_cents == 4500
    assert row.mexy_fee_cents == 800


def test_external_marketplace_order_requotes_tracking_fee(monkeypatch):
    monkeypatch.setattr(
        "app.modules.delivery_dispatch.service.claim_dispatch_short_id",
        lambda _session, _preferred: "EXT1",
    )
    service, captured = _service()
    order = _live_menu_order(external_id="justo-1", delivery_fee_cents=0)
    restaurant = SimpleNamespace(id=order.restaurant_id)

    service.create_accepted_for_order(restaurant, order)

    row = captured["row"]
    assert row.quoted_fee_cents == 9999
    assert row.tracking_token

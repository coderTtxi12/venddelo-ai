"""Turn a Justo ecommerce.order.created payload into a Mexy kitchen order.

Justo does not document an "Uber exclusivo" enum. In their schema:
- source is the channel (justo, ubereats, rappi, …)
- hasManagedDelivery means Justo's own couriers deliver
- hasExternalDeliveryProvider (when present) means another company delivers

Uber exclusivo is the Uber Eats order the restaurant must deliver itself
(about 15% commission). Uber's own courier is skipped.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.models.developer import RestaurantJustoStore
from app.db.models.orders import Order
from app.db.models.restaurant import Restaurant
from app.infra.realtime.order_hub import get_order_realtime_hub
from app.modules.orders.adapters import SqlAlchemyOrderRepository
from app.modules.orders.schemas import OrderCreate, OrderItemCreate

_OWN_SOURCES = frozenset(
    {
        "",
        "justo",
        "web",
        "website",
        "app",
        "pos",
        "ecommerce",
        "client",
        "clientview",
        "messenger",
        "totem",
    }
)
_BLOCKED_SOURCES = frozenset(
    {"rappi", "pedidosya", "didi", "didifood", "hubster", "ordatic"}
)


def justo_signing_secret(session, restaurant_id: uuid.UUID) -> str | None:
    row = session.get(RestaurantJustoStore, restaurant_id)
    if row is None or not row.signing_secret:
        return None
    return row.signing_secret


def verify_justo_signature(secret: str | None, raw_body: bytes, signature: str | None) -> bool:
    """Justo signs the raw body with HMAC-SHA1. The hex digest is X-Orion-Signature."""
    if not secret or not signature:
        return False
    passed = signature.strip()
    if passed.lower().startswith("sha1="):
        passed = passed[5:]
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(expected, passed.lower())


def normalize_source(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").strip().lower())


def classify_justo_order(order: dict[str, Any]) -> str | None:
    """Return justo or uber_exclusive when Mexy should create the order."""
    if str(order.get("deliveryType") or "").strip().lower() != "delivery":
        return None
    if order.get("hasManagedDelivery") is True:
        return None
    if order.get("hasExternalDeliveryProvider") is True:
        return None
    source = normalize_source(order.get("source"))
    if source in _BLOCKED_SOURCES:
        return None
    if "uber" in source:
        if _uber_courier_delivers(order):
            return None
        return "uber_exclusive"
    if source in _OWN_SOURCES or source.startswith("justo"):
        return "justo"
    return None


def _uber_courier_delivers(order: dict[str, Any]) -> bool:
    """True when Uber's courier, not the restaurant, is already responsible."""
    params = order.get("orderParams") if isinstance(order.get("orderParams"), dict) else {}
    for key in ("deliveryProvider", "fulfilledBy", "courier", "deliveryBy", "logistics"):
        if "uber" in normalize_source(params.get(key)):
            return True
    for delivery in order.get("deliveries") or []:
        if not isinstance(delivery, dict):
            continue
        url = str(delivery.get("trackingURL") or "").lower()
        if "uber" in url:
            return True
        info = {
            **(delivery.get("driverInformation") or {}),
            **(delivery.get("deliveryInformation") or {}),
        }
        blob = json.dumps(info, default=str).lower()
        if any(
            token in blob
            for token in ("uber direct", "uberfleet", "fulfilled_by_uber", "uber_courier")
        ):
            return True
    return False


def _money_to_cents(value: object) -> int:
    try:
        amount = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0
    if amount < 0:
        return 0
    return int(round(amount * 100))


def _address(order: dict[str, Any]) -> tuple[str, float | None, float | None]:
    address = order.get("address") if isinstance(order.get("address"), dict) else {}
    parts = [
        str(address.get("address") or "").strip(),
        str(address.get("addressLine2") or "").strip(),
        str(address.get("addressSecondary") or "").strip(),
        str(address.get("comment") or "").strip(),
    ]
    text = ", ".join(part for part in parts if part)
    location = address.get("location") if isinstance(address.get("location"), dict) else {}
    lat = location.get("lat")
    lng = location.get("lng")
    try:
        latitude = float(lat) if lat is not None else None
        longitude = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        latitude = longitude = None
    return text or "Dirección no enviada por Justo", latitude, longitude


def _payment_method(order: dict[str, Any]) -> str:
    payment = str(order.get("paymentType") or "").lower()
    if "cash" in payment or "efectivo" in payment:
        return "cash"
    return "transfer"


def _items(order: dict[str, Any]) -> list[OrderItemCreate]:
    raw_items = order.get("items") if isinstance(order.get("items"), list) else []
    lines: list[OrderItemCreate] = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        product = raw.get("product") if isinstance(raw.get("product"), dict) else {}
        name = str(product.get("name") or raw.get("productName") or "Producto").strip()
        comment = str(raw.get("comment") or raw.get("description") or "").strip()
        if comment:
            name = f"{name} ({comment})"
        try:
            quantity = int(raw.get("amount") or 1)
        except (TypeError, ValueError):
            quantity = 1
        quantity = max(quantity, 1)
        unit = _money_to_cents(raw.get("unitPrice") or raw.get("productPrice"))
        line_total = _money_to_cents(raw.get("totalPrice")) or unit * quantity
        lines.append(
            OrderItemCreate(
                product_name=name[:500],
                quantity=quantity,
                unit_price_cents=unit,
                line_subtotal_cents=unit * quantity,
                line_total_cents=line_total,
            )
        )
    if lines:
        return lines
    total = _money_to_cents(order.get("totalPrice") or order.get("itemsPrice"))
    return [
        OrderItemCreate(
            product_name="Pedido Justo",
            quantity=1,
            unit_price_cents=total,
            line_subtotal_cents=total,
            line_total_cents=total,
        )
    ]


def build_order_create(
    restaurant_id: uuid.UUID,
    order: dict[str, Any],
    channel: str,
) -> OrderCreate:
    address, latitude, longitude = _address(order)
    items = _items(order)
    items_total = sum(item.line_total_cents for item in items)
    delivery_fee = _money_to_cents(order.get("deliveryFee"))
    total = _money_to_cents(order.get("totalPrice")) or items_total + delivery_fee
    code = str(order.get("fullCode") or order.get("code") or "").strip()
    channel_label = "Uber exclusivo" if channel == "uber_exclusive" else "Justo"
    note_bits = [channel_label]
    if code:
        note_bits.append(code)
    phone = str(order.get("phone") or "").strip() or "sin teléfono"
    external_id = str(order.get("_id") or "").strip()
    return OrderCreate(
        restaurant_id=restaurant_id,
        type="delivery",
        customer_name=str(order.get("buyerName") or "Cliente").strip() or "Cliente",
        customer_phone=phone,
        payment_method=_payment_method(order),
        subtotal_cents=items_total,
        subtotal_before_discount_cents=items_total,
        total_cents=total,
        delivery_address=address,
        delivery_latitude=latitude,
        delivery_longitude=longitude,
        delivery_fee_cents=delivery_fee,
        note=" · ".join(note_bits),
        external_source=channel,
        external_id=external_id or None,
        idempotency_key=f"justo:{external_id}" if external_id else None,
        items=items,
    )


def ingest_justo_event(session, restaurant_id: uuid.UUID, payload: dict[str, Any]) -> dict[str, Any]:
    event_type = str(payload.get("type") or "")
    if event_type and event_type != "ecommerce.order.created":
        return {"accepted": False, "reason": "ignored_event"}
    restaurant = session.get(Restaurant, restaurant_id)
    if restaurant is None or restaurant.deleted_at is not None:
        return {"accepted": False, "reason": "unknown_restaurant"}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    order = data.get("order") if isinstance(data.get("order"), dict) else None
    if order is None:
        return {"accepted": False, "reason": "missing_order"}
    channel = classify_justo_order(order)
    if channel is None:
        return {"accepted": False, "reason": "filtered"}
    external_id = str(order.get("_id") or "").strip()
    if not external_id:
        return {"accepted": False, "reason": "missing_order_id"}
    existing = session.scalar(
        select(Order).where(
            Order.restaurant_id == restaurant_id,
            Order.external_source == channel,
            Order.external_id == external_id,
        )
    )
    if existing is not None:
        return {"accepted": True, "duplicate": True, "order_id": str(existing.id)}
    created = build_order_create(restaurant_id, order, channel)
    try:
        with session.begin_nested():
            dto = SqlAlchemyOrderRepository(session).add(created)
    except IntegrityError:
        return {"accepted": True, "duplicate": True}
    get_order_realtime_hub().publish_sync(
        restaurant_id,
        {"type": "order.created", "order": dto.model_dump(mode="json")},
    )
    return {"accepted": True, "duplicate": False, "order_id": str(dto.id)}

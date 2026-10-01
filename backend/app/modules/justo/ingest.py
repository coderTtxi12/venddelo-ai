"""Turn a Justo newOrder payload into a Mexy kitchen order.

Every source is accepted when the restaurant delivers it:
deliveryType is delivery and hasManagedDelivery is false.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.db.models.developer import JustoWebhookReceipt, RestaurantJustoStore
from app.db.models.orders import Order
from app.db.models.restaurant import Restaurant
from app.infra.realtime.order_hub import get_order_realtime_hub
from app.modules.orders.adapters import SqlAlchemyOrderRepository
from app.modules.orders.schemas import OrderCreate, OrderItemCreate

_CREATE_EVENT_TYPES = frozenset({"ecommerce.order.created", "neworder"})

logger = logging.getLogger(__name__)


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
    """Any channel, as long as the restaurant delivers it."""
    if str(order.get("deliveryType") or "").strip().lower() != "delivery":
        return None
    if order.get("hasManagedDelivery") is True:
        return None
    source = normalize_source(order.get("source") or order.get("channel")) or "justo"
    return source[:32]


def public_tracking_url(subdomain: str, token: str) -> str:
    from app.core.config import get_settings

    domain = (get_settings().menu_public_domain or "mxy.mx").strip().strip(".")
    return f"https://{subdomain}.{domain}/rastreo/{token}"


def _money_to_cents(value: object) -> int:
    try:
        amount = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0
    if amount < 0:
        return 0
    return int(round(amount * 100))


def _looks_encrypted(value: str) -> bool:
    text = value.strip()
    if not text or text.startswith("justo:"):
        return True
    if " " in text or "," in text:
        return False
    if len(text) < 16:
        return False
    return re.fullmatch(r"[A-Za-z0-9+/=_\-/]+", text) is not None


def _readable(value: object) -> str:
    text = str(value or "").strip()
    if not text or _looks_encrypted(text):
        return ""
    return text


def _address(order: dict[str, Any]) -> tuple[str, float | None, float | None]:
    address = order.get("address") if isinstance(order.get("address"), dict) else {}
    parts: list[str] = []
    for key in ("address", "streetAddress", "addressLine2", "addressSecondary", "comment"):
        piece = _readable(address.get(key))
        if piece and piece not in parts:
            parts.append(piece)
    locality = _readable(address.get("locality"))
    if locality and not any(locality in part for part in parts):
        parts.append(locality)
    text = ", ".join(parts)
    location = address.get("location") if isinstance(address.get("location"), dict) else {}
    lat = location.get("lat")
    lng = location.get("lng")
    try:
        latitude = float(lat) if lat is not None else None
        longitude = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        latitude = longitude = None
    return text or "Dirección no enviada por Justo", latitude, longitude


def _choice(option_id: Any, label: Any, price: Any) -> dict[str, Any] | None:
    text = str(label or "").strip()
    if not text:
        return None
    choice_id = str(option_id or "").strip() or text
    return {"id": choice_id, "label": text, "price_cents": _money_to_cents(price)}


def _groups_from_options(raw_options: list[Any]) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    for option in raw_options:
        if not isinstance(option, dict):
            continue
        title = str(option.get("title") or option.get("internalName") or "").strip()
        selections = option.get("selections") if isinstance(option.get("selections"), list) else []
        raw_prices = option.get("selectionsPrices")
        prices = raw_prices if isinstance(raw_prices, list) else []
        external_ids = (
            option.get("selectionsExternalIds")
            if isinstance(option.get("selectionsExternalIds"), list)
            else []
        )
        choices: list[dict[str, Any]] = []
        for index, selection in enumerate(selections):
            price = prices[index] if index < len(prices) else 0
            external_id = external_ids[index] if index < len(external_ids) else None
            choice = _choice(external_id or selection, selection, price)
            if choice is not None:
                choices.append(choice)
        if title and choices:
            groups.append(
                {
                    "id": str(option.get("optionId") or title),
                    "title": title,
                    "choices": choices,
                }
            )
    return groups


def _groups_from_modifiers(modifiers: list[Any]) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    for modifier in modifiers:
        if not isinstance(modifier, dict):
            continue
        title = str(modifier.get("shortName") or modifier.get("name") or "").strip()
        options = modifier.get("options") if isinstance(modifier.get("options"), list) else []
        counts = modifier.get("countById") if isinstance(modifier.get("countById"), dict) else {}
        choices: list[dict[str, Any]] = []
        for option in options:
            if not isinstance(option, dict):
                continue
            choice = _choice(
                option.get("optionId") or option.get("name"),
                option.get("name"),
                option.get("price"),
            )
            if choice is None:
                continue
            try:
                count = int(counts.get(str(option.get("optionId"))) or 1)
            except (TypeError, ValueError):
                count = 1
            choices.extend([choice] * max(count, 1))
        if title and choices:
            groups.append(
                {
                    "id": str(modifier.get("modifierId") or title),
                    "title": title,
                    "choices": choices,
                }
            )
    return groups


def _selected_options(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Snapshot the kitchen can render without a Mexy product catalog."""
    options = raw.get("options") if isinstance(raw.get("options"), list) else []
    groups = _groups_from_options(options)
    if not groups:
        modifiers = raw.get("modifiers") if isinstance(raw.get("modifiers"), list) else []
        groups = _groups_from_modifiers(modifiers)
    comment = _readable(raw.get("comment"))
    if comment:
        groups.append(
            {
                "id": "comment",
                "title": "Comentario",
                "choices": [{"id": "comment", "label": comment, "price_cents": 0}],
            }
        )
    if not groups:
        return None
    return {"__groups__": groups}


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
                selected_options=_selected_options(raw),
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
    # Justo's deliveryFee is not Mexy's shipping cost. The accept drawer
    # quotes Mexy and that quote becomes the dispatch fee. The order total
    # stays what the customer paid on Justo (totalPrice).
    total = _money_to_cents(order.get("totalPrice") or order.get("amountToPay")) or items_total
    code = str(order.get("fullCode") or order.get("code") or "").strip()
    origin = str(order.get("source") or order.get("channel") or channel).strip()
    note_bits = [origin]
    if code:
        note_bits.append(code)
    phone = str(order.get("phone") or "").strip() or "sin teléfono"
    external_id = str(order.get("_id") or "").strip()
    cash_denomination = None
    if _payment_method(order) == "cash":
        cash_denomination = _money_to_cents(order.get("cashAmount"))
        if cash_denomination < total:
            cash_denomination = total
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
        delivery_fee_cents=0,
        cash_denomination_cents=cash_denomination,
        note=" · ".join(note_bits),
        external_source=channel,
        external_id=external_id or None,
        idempotency_key=f"justo:{external_id}" if external_id else None,
        items=items,
    )


def attach_justo_tracking(session, restaurant_id: uuid.UUID, order_id: str, idempotency) -> str | None:
    """Open the accepted dispatch stub. /orders builds the link from its token."""
    try:
        from app.infra.storage.factory import build_storage
        from app.modules.delivery_dispatch.service import RestaurantDispatchService
        from app.modules.delivery_providers.adapters import SqlAlchemyDeliveryProviderRepository
        from app.modules.orders.adapters import SqlAlchemyOrderRepository
        from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository

        restaurant = SqlAlchemyRestaurantRepository(session).get(restaurant_id)
        orders = SqlAlchemyOrderRepository(session)
        order = orders.get(uuid.UUID(order_id))
        if restaurant is None or order is None:
            return None
        RestaurantDispatchService(
            session,
            SqlAlchemyDeliveryProviderRepository(session),
            build_storage(),
            idempotency,
        ).create_accepted_for_order(restaurant, order)
        refreshed = orders.get(order.id)
        if refreshed is None or refreshed.dispatch is None:
            return None
        url = public_tracking_url(restaurant.subdomain, refreshed.dispatch.tracking_token)
        get_order_realtime_hub().publish_sync(
            restaurant_id,
            {"type": "order.updated", "order": refreshed.model_dump(mode="json")},
        )
        return url
    except Exception:
        logger.exception(
            "justo tracking stub failed restaurant=%s order=%s",
            restaurant_id,
            order_id,
        )
        return None


def record_justo_receipt(
    session,
    restaurant_id: uuid.UUID,
    payload: dict[str, Any],
    result: dict[str, Any],
) -> None:
    """Keep the raw body. Justo does not retry a 200, so this is the only copy."""
    if result.get("duplicate"):
        label = "duplicate"
    elif result.get("accepted"):
        label = "created"
    else:
        label = str(result.get("reason") or "unknown")[:32]
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    order = data.get("order") if isinstance(data.get("order"), dict) else {}
    logger.info(
        "justo inbound restaurant=%s type=%s result=%s deliveryType=%s source=%s channel=%s managed=%s external=%s order_keys=%s",
        restaurant_id,
        payload.get("type"),
        label,
        order.get("deliveryType"),
        order.get("source"),
        order.get("channel"),
        order.get("hasManagedDelivery"),
        order.get("hasExternalDeliveryProvider"),
        sorted(str(key) for key in order.keys()),
    )
    session.add(
        JustoWebhookReceipt(
            restaurant_id=restaurant_id,
            result=label,
            payload=payload,
            created_at=datetime.now(UTC),
        )
    )
    session.flush()
    stale_ids = list(
        session.scalars(
            select(JustoWebhookReceipt.id)
            .where(JustoWebhookReceipt.restaurant_id == restaurant_id)
            .order_by(JustoWebhookReceipt.created_at.desc(), JustoWebhookReceipt.id.desc())
            .offset(15)
        )
    )
    if stale_ids:
        session.execute(delete(JustoWebhookReceipt).where(JustoWebhookReceipt.id.in_(stale_ids)))


def list_justo_receipts(session, restaurant_id: uuid.UUID, limit: int = 10) -> list[JustoWebhookReceipt]:
    return list(
        session.scalars(
            select(JustoWebhookReceipt)
            .where(JustoWebhookReceipt.restaurant_id == restaurant_id)
            .order_by(JustoWebhookReceipt.created_at.desc(), JustoWebhookReceipt.id.desc())
            .limit(limit)
        )
    )


def ingest_justo_event(session, restaurant_id: uuid.UUID, payload: dict[str, Any]) -> dict[str, Any]:
    event_type = str(payload.get("type") or "")
    if event_type and normalize_source(event_type) not in _CREATE_EVENT_TYPES:
        logger.info(
            "justo inbound ignored restaurant=%s type=%s",
            restaurant_id,
            event_type,
        )
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

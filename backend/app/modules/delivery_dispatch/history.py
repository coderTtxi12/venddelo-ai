from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationError
from app.db.models.delivery import (
    DeliveryCreditHold,
    DeliveryDispatchRequest,
)
from app.db.models.restaurant import Restaurant
from app.modules.delivery_dispatch.schemas import (
    RiderHistoryHoldDTO,
    RiderHistoryItemDTO,
)

MEXICO_TZ = ZoneInfo("America/Mexico_City")
HISTORY_STATUSES = frozenset({"delivered", "cancelled"})
DEFAULT_LIMIT = 50
MAX_LIMIT = 100


def mexico_city_range(start: date, end: date) -> tuple[datetime, datetime]:
    if end < start:
        raise ValidationError("La fecha final no puede ser anterior a la inicial")
    start_local = datetime(start.year, start.month, start.day, tzinfo=MEXICO_TZ)
    end_local = datetime(end.year, end.month, end.day, tzinfo=MEXICO_TZ) + timedelta(days=1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def today_mexico() -> date:
    return datetime.now(MEXICO_TZ).date()


def closed_at_expr():
    return func.coalesce(
        DeliveryDispatchRequest.cancelled_at,
        DeliveryDispatchRequest.updated_at,
    )


def _clamp_limit(limit: int | None) -> int:
    value = DEFAULT_LIMIT if limit is None else limit
    if value < 1:
        value = 1
    return min(value, MAX_LIMIT)


def _to_item(
    request: DeliveryDispatchRequest,
    restaurant: Restaurant | None,
    hold: DeliveryCreditHold | None,
) -> RiderHistoryItemDTO:
    closed_at = request.cancelled_at or request.updated_at
    credit_hold_cents = (
        hold.amount_cents if hold is not None and hold.status == "held" else 0
    )
    return RiderHistoryItemDTO(
        id=request.id,
        short_id=request.short_id,
        status=request.status,
        closed_at=closed_at,
        restaurant_name=restaurant.name if restaurant is not None else "",
        restaurant_address=restaurant.address if restaurant is not None else None,
        dropoff_address=request.dropoff_address,
        quoted_fee_cents=request.quoted_fee_cents,
        payment_method=request.payment_method,
        collect_cents=request.collect_cents,
        cash_denomination_cents=(
            request.cash_denomination_cents if request.payment_method == "cash" else None
        ),
        package_count=request.package_count,
        package_size=request.package_size,
        customer_name=request.customer_name,
        customer_phone=request.customer_phone,
        notes=request.notes,
        credit_hold_cents=credit_hold_cents,
    )


def list_active_holds(session: Session, driver_id: uuid.UUID) -> list[RiderHistoryHoldDTO]:
    rows = session.execute(
        select(DeliveryCreditHold, DeliveryDispatchRequest, Restaurant)
        .join(
            DeliveryDispatchRequest,
            DeliveryDispatchRequest.id == DeliveryCreditHold.request_id,
        )
        .join(Restaurant, Restaurant.id == DeliveryDispatchRequest.restaurant_id)
        .where(
            DeliveryCreditHold.driver_id == driver_id,
            DeliveryCreditHold.status == "held",
        )
        .order_by(DeliveryCreditHold.created_at.desc())
    ).all()
    return [
        RiderHistoryHoldDTO(
            request_id=request.id,
            short_id=request.short_id,
            restaurant_name=restaurant.name,
            amount_cents=hold.amount_cents,
            customer_name=request.customer_name,
        )
        for hold, request, restaurant in rows
    ]


def list_dispatch_history(
    session: Session,
    *,
    provider_id: uuid.UUID | None = None,
    driver_id: uuid.UUID | None = None,
    zone_id: uuid.UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    status: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> dict:
    start_d = start or today_mexico()
    end_d = end or start_d
    start_utc, end_utc = mexico_city_range(start_d, end_d)
    closed = closed_at_expr()
    if status is not None and status not in HISTORY_STATUSES:
        raise ValidationError("Estado de historial no válido")
    statuses = HISTORY_STATUSES if status is None else {status}

    filters = [
        DeliveryDispatchRequest.status.in_(tuple(statuses)),
        closed >= start_utc,
        closed < end_utc,
    ]
    if driver_id is not None:
        filters.append(DeliveryDispatchRequest.assigned_driver_id == driver_id)
    if provider_id is not None:
        filters.append(DeliveryDispatchRequest.delivery_provider_id == provider_id)
    if zone_id is not None:
        filters.append(DeliveryDispatchRequest.zone_id == zone_id)

    page_limit = _clamp_limit(limit)
    page_offset = max(0, offset)

    total = session.scalar(
        select(func.count()).select_from(DeliveryDispatchRequest).where(*filters)
    ) or 0
    delivered_count = session.scalar(
        select(func.count())
        .select_from(DeliveryDispatchRequest)
        .where(*filters, DeliveryDispatchRequest.status == "delivered")
    ) or 0
    cancelled_count = session.scalar(
        select(func.count())
        .select_from(DeliveryDispatchRequest)
        .where(*filters, DeliveryDispatchRequest.status == "cancelled")
    ) or 0
    earnings = session.scalar(
        select(func.coalesce(func.sum(DeliveryDispatchRequest.quoted_fee_cents), 0)).where(
            *filters,
            DeliveryDispatchRequest.status == "delivered",
        )
    ) or 0

    rows = session.execute(
        select(DeliveryDispatchRequest, Restaurant, DeliveryCreditHold)
        .join(Restaurant, Restaurant.id == DeliveryDispatchRequest.restaurant_id)
        .outerjoin(
            DeliveryCreditHold,
            DeliveryCreditHold.request_id == DeliveryDispatchRequest.id,
        )
        .where(*filters)
        .order_by(closed.desc(), DeliveryDispatchRequest.created_at.desc())
        .offset(page_offset)
        .limit(page_limit)
    ).all()

    items = [
        _to_item(request, restaurant, hold) for request, restaurant, hold in rows
    ]
    return {
        "start": start_d,
        "end": end_d,
        "items": items,
        "total": int(total),
        "delivered_count": int(delivered_count),
        "cancelled_count": int(cancelled_count),
        "earnings_cents": int(earnings),
        "has_more": page_offset + len(items) < int(total),
    }

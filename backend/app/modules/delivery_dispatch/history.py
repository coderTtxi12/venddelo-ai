from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationError
from app.db.models.delivery import (
    DeliveryCreditHold,
    DeliveryDispatchOffer,
    DeliveryDispatchRequest,
    DeliveryDriver,
    DeliveryProviderZone,
)
from app.db.models.restaurant import Restaurant
from app.modules.delivery_dispatch.monitor import _offers_by_request, _timeline_events
from app.modules.delivery_dispatch.schemas import (
    ProviderHistoryItemDTO,
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


def _accepted_cases(
    session: Session, requests: list[DeliveryDispatchRequest]
) -> dict[uuid.UUID, str]:
    if not requests:
        return {}
    request_ids = [request.id for request in requests]
    offers = session.scalars(
        select(DeliveryDispatchOffer).where(
            DeliveryDispatchOffer.request_id.in_(request_ids),
            DeliveryDispatchOffer.status == "accepted",
        )
    ).all()
    latest: dict[uuid.UUID, DeliveryDispatchOffer] = {}
    for offer in offers:
        current = latest.get(offer.request_id)
        offer_at = offer.responded_at or offer.created_at
        current_at = (
            current.responded_at or current.created_at if current is not None else None
        )
        if current is None or (
            offer_at is not None and (current_at is None or offer_at >= current_at)
        ):
            latest[offer.request_id] = offer
    cases = {request_id: offer.case_applied for request_id, offer in latest.items()}
    group_case: dict[uuid.UUID, str] = {}
    for request in requests:
        case = cases.get(request.id)
        if request.dispatch_group_id is not None and case:
            group_case[request.dispatch_group_id] = case
    for request in requests:
        if request.id in cases or request.dispatch_group_id is None:
            continue
        inherited = group_case.get(request.dispatch_group_id)
        if inherited is not None:
            cases[request.id] = inherited
    return cases


def _to_provider_item(
    request: DeliveryDispatchRequest,
    restaurant: Restaurant | None,
    hold: DeliveryCreditHold | None,
    driver: DeliveryDriver | None,
    zone: DeliveryProviderZone | None,
    case_applied: str | None,
    offers: list[DeliveryDispatchOffer],
) -> ProviderHistoryItemDTO:
    base = _to_item(request, restaurant, hold)
    driver_name = None
    if driver is not None:
        driver_name = f"{driver.first_name} {driver.last_name}".strip() or None
    return ProviderHistoryItemDTO(
        **base.model_dump(),
        assigned_driver_id=request.assigned_driver_id,
        assigned_driver_name=driver_name,
        zone_id=request.zone_id,
        zone_name=zone.name if zone is not None else None,
        restaurant_id=request.restaurant_id,
        restaurant_lat=restaurant.latitude if restaurant is not None else None,
        restaurant_lng=restaurant.longitude if restaurant is not None else None,
        dropoff_lat=request.dropoff_lat,
        dropoff_lng=request.dropoff_lng,
        dropoff_maps_url=request.dropoff_maps_url,
        ready_at=request.ready_at,
        search_at=request.search_at,
        created_at=request.created_at,
        cancelled_at=request.cancelled_at,
        updated_at=request.updated_at,
        dispatch_group_id=request.dispatch_group_id,
        case_applied=case_applied,
        credit_hold_status=hold.status if hold is not None else None,
        timeline=_timeline_events(
            request,
            timeout_at=request.search_at,
            assigned_name=driver_name,
            offers=offers,
        ),
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
    restaurant_id: uuid.UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    status: str | None = None,
    limit: int | None = None,
    offset: int = 0,
    include_provider_fields: bool = False,
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
    if restaurant_id is not None:
        filters.append(DeliveryDispatchRequest.restaurant_id == restaurant_id)

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
        select(
            DeliveryDispatchRequest,
            Restaurant,
            DeliveryCreditHold,
            DeliveryDriver,
            DeliveryProviderZone,
        )
        .join(Restaurant, Restaurant.id == DeliveryDispatchRequest.restaurant_id)
        .outerjoin(
            DeliveryCreditHold,
            DeliveryCreditHold.request_id == DeliveryDispatchRequest.id,
        )
        .outerjoin(
            DeliveryDriver,
            DeliveryDriver.id == DeliveryDispatchRequest.assigned_driver_id,
        )
        .outerjoin(
            DeliveryProviderZone,
            DeliveryProviderZone.id == DeliveryDispatchRequest.zone_id,
        )
        .where(*filters)
        .order_by(closed.desc(), DeliveryDispatchRequest.created_at.desc())
        .offset(page_offset)
        .limit(page_limit)
    ).all()

    requests = [request for request, *_rest in rows]
    cases = _accepted_cases(session, requests) if include_provider_fields else {}
    offers_by_request = (
        _offers_by_request(session, [request.id for request in requests])
        if include_provider_fields
        else {}
    )
    if include_provider_fields:
        items = [
            _to_provider_item(
                request,
                restaurant,
                hold,
                driver,
                zone,
                cases.get(request.id),
                offers_by_request.get(request.id, []),
            )
            for request, restaurant, hold, driver, zone in rows
        ]
    else:
        items = [
            _to_item(request, restaurant, hold)
            for request, restaurant, hold, _driver, _zone in rows
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

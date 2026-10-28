from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models.delivery import (
    DeliveryDispatchRequest,
    DeliveryDriver,
    DeliveryTerminalHold,
)
from app.db.models.restaurant import Restaurant


def ensure_terminal_hold(
    session: Session,
    request: DeliveryDispatchRequest,
    driver: DeliveryDriver,
    *,
    now: datetime,
) -> DeliveryTerminalHold | None:
    if getattr(request, "payment_method", None) != "card_terminal":
        return None
    existing = getattr(request, "terminal_hold", None)
    if existing is not None:
        return existing
    hold = DeliveryTerminalHold(
        driver_id=driver.id,
        request_id=request.id,
        status="held",
        held_at=now,
    )
    session.add(hold)
    request.terminal_hold = hold
    return hold


def release_terminal_hold(
    hold: DeliveryTerminalHold,
    *,
    released_by_user_id: UUID,
    now: datetime,
) -> DeliveryTerminalHold:
    hold.status = "released"
    hold.released_at = now
    hold.released_by_user_id = released_by_user_id
    return hold


def list_held_terminal_holds(
    session: Session,
    *,
    driver_id: UUID | None = None,
    provider_id: UUID | None = None,
) -> list[DeliveryTerminalHold]:
    stmt = (
        select(DeliveryTerminalHold)
        .join(DeliveryDispatchRequest)
        .where(DeliveryTerminalHold.status == "held")
        .options(
            selectinload(DeliveryTerminalHold.driver),
            selectinload(DeliveryTerminalHold.request),
        )
        .order_by(DeliveryTerminalHold.held_at.desc())
    )
    if driver_id is not None:
        stmt = stmt.where(DeliveryTerminalHold.driver_id == driver_id)
    if provider_id is not None:
        stmt = stmt.where(DeliveryDispatchRequest.delivery_provider_id == provider_id)
    return list(session.scalars(stmt).all())


def serialize_held_terminal_holds(
    session: Session,
    driver_id: UUID,
) -> list[dict[str, object]]:
    payload: list[dict[str, object]] = []
    for hold in list_held_terminal_holds(session, driver_id=driver_id):
        request = hold.request
        restaurant = (
            session.get(Restaurant, request.restaurant_id) if request is not None else None
        )
        payload.append(
            {
                "request_id": str(hold.request_id),
                "short_id": request.short_id if request is not None else "",
                "restaurant_name": restaurant.name if restaurant is not None else "",
                "restaurant_id": str(request.restaurant_id) if request is not None else "",
                "held_at": hold.held_at.isoformat(),
            }
        )
    return payload

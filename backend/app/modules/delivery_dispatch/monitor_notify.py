from __future__ import annotations

import uuid
from collections.abc import Callable

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.db.models.delivery import DeliveryDispatchRequest, DeliveryDriver
from app.infra.realtime.dispatch_hub import get_dispatch_realtime_hub
from app.infra.realtime.restaurant_dispatch_hub import get_restaurant_dispatch_realtime_hub
from app.infra.realtime.rider_hub import get_rider_realtime_hub

_AFTER_COMMIT_HOOKS = "rider_notify_after_commit_hooks"
_AFTER_COMMIT_REGISTERED = "rider_notify_after_commit_registered"


def notify_dispatch_monitor_changed(provider_id: uuid.UUID) -> None:
    get_dispatch_realtime_hub().publish_sync(
        provider_id,
        {"type": "monitor.updated"},
    )


def notify_rider_updated(
    driver_id: uuid.UUID,
    *,
    session: Session | None = None,
    credit_limit_cents: int | None = None,
    credit_held_cents: int | None = None,
) -> None:
    payload: dict[str, object] = {"type": "rider.updated"}
    if credit_limit_cents is not None:
        payload["credit_limit_cents"] = credit_limit_cents
    if credit_held_cents is not None:
        payload["credit_held_cents"] = credit_held_cents

    def publish() -> None:
        get_rider_realtime_hub().publish_sync(driver_id, payload)

    _publish_after_commit(session, publish)


def notify_request_realtime(session: Session, request: DeliveryDispatchRequest) -> None:
    provider_id = request.delivery_provider_id
    restaurant_id = request.restaurant_id
    payload = {
        "type": "dispatch.updated",
        "request_id": str(request.id),
        "status": request.status,
    }

    def publish_request_hubs() -> None:
        notify_dispatch_monitor_changed(provider_id)
        get_restaurant_dispatch_realtime_hub().publish_sync(restaurant_id, payload)

    _publish_after_commit(session, publish_request_hubs)
    if request.assigned_driver_id is None:
        return
    driver = request.assigned_driver
    if driver is None:
        driver = session.get(DeliveryDriver, request.assigned_driver_id)
    if driver is None:
        notify_rider_updated(request.assigned_driver_id, session=session)
        return
    notify_rider_updated(
        request.assigned_driver_id,
        session=session,
        credit_limit_cents=driver.credit_limit_cents,
        credit_held_cents=driver.credit_held_cents,
    )


def notify_driver_location_realtime(session: Session, driver: DeliveryDriver) -> None:
    at = driver.location_updated_at
    payload = {
        "type": "driver.location",
        "driver_id": str(driver.id),
        "last_lat": driver.last_lat,
        "last_lng": driver.last_lng,
        "location_updated_at": at.isoformat() if at is not None else None,
    }

    def publish() -> None:
        get_dispatch_realtime_hub().publish_sync(driver.delivery_provider_id, payload)

    _publish_after_commit(session, publish)


def _publish_after_commit(session: Session | None, hook: Callable[[], None]) -> None:
    in_transaction = getattr(session, "in_transaction", None)
    if session is None or not callable(in_transaction) or not session.in_transaction():
        hook()
        return

    hooks = session.info.setdefault(_AFTER_COMMIT_HOOKS, [])
    hooks.append(hook)
    if session.info.get(_AFTER_COMMIT_REGISTERED):
        return
    session.info[_AFTER_COMMIT_REGISTERED] = True

    def _committed(target: Session) -> None:
        pending = list(target.info.pop(_AFTER_COMMIT_HOOKS, []))
        target.info.pop(_AFTER_COMMIT_REGISTERED, None)
        for item in pending:
            item()

    def _rolled(target: Session) -> None:
        target.info.pop(_AFTER_COMMIT_HOOKS, None)
        target.info.pop(_AFTER_COMMIT_REGISTERED, None)

    event.listen(session, "after_commit", _committed, once=True)
    event.listen(session, "after_rollback", _rolled, once=True)

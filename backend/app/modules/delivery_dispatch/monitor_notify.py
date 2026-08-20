from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.db.models.delivery import DeliveryDispatchRequest, DeliveryDriver
from app.infra.realtime.dispatch_hub import get_dispatch_realtime_hub
from app.infra.realtime.restaurant_dispatch_hub import get_restaurant_dispatch_realtime_hub
from app.infra.realtime.rider_hub import get_rider_realtime_hub
from app.modules.delivery_dispatch.tracking_view import (
    emit_public_tracking_location,
    emit_public_tracking_snapshot,
)


def notify_dispatch_monitor_changed(provider_id: uuid.UUID) -> None:
    get_dispatch_realtime_hub().publish_sync(
        provider_id,
        {"type": "monitor.updated"},
    )


def notify_request_realtime(session: Session, request: DeliveryDispatchRequest) -> None:
    notify_dispatch_monitor_changed(request.delivery_provider_id)
    get_restaurant_dispatch_realtime_hub().publish_sync(
        request.restaurant_id,
        {"type": "dispatch.updated"},
    )
    emit_public_tracking_snapshot(session, request)


def notify_driver_location_realtime(session: Session, driver: DeliveryDriver) -> None:
    notify_dispatch_monitor_changed(driver.delivery_provider_id)
    emit_public_tracking_location(session, driver)

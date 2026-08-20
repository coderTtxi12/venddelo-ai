from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any
from uuid import UUID

from app.modules.delivery_dispatch.fcm import send_fcm_offer
from app.modules.delivery_dispatch.monitor_notify import notify_rider_updated

logger = logging.getLogger(__name__)

Notifier = Callable[[Any, Any], None]

_notifier: Notifier | None = None


def set_offer_notifier(notifier: Notifier | None) -> None:
    global _notifier
    _notifier = notifier


def notify_offer(driver: Any, offer: Any) -> None:
    driver_id = getattr(driver, "id", None)
    if isinstance(driver_id, UUID):
        notify_rider_updated(driver_id)

    token = getattr(driver, "fcm_token", None)
    if not token:
        logger.info(
            "Skipping FCM for offer %s: driver %s has no fcm_token",
            getattr(offer, "id", offer),
            getattr(driver, "id", "?"),
        )
        return
    notifier = _notifier if _notifier is not None else send_fcm_offer
    notifier(driver, offer)

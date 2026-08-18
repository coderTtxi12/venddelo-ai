from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from app.modules.delivery_dispatch.fcm import send_fcm_offer

logger = logging.getLogger(__name__)

Notifier = Callable[[Any, Any], None]

_notifier: Notifier | None = None


def set_offer_notifier(notifier: Notifier | None) -> None:
    global _notifier
    _notifier = notifier


def notify_offer(driver: Any, offer: Any) -> None:
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

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

Notifier = Callable[[Any, Any], None]

_notifier: Notifier | None = None


def set_offer_notifier(notifier: Notifier | None) -> None:
    global _notifier
    _notifier = notifier


def notify_offer(driver: Any, offer: Any) -> None:
    token = getattr(driver, "fcm_token", None)
    if not token:
        return
    notifier = _notifier if _notifier is not None else _log_skip_notifier
    notifier(driver, offer)


def _log_skip_notifier(driver: Any, offer: Any) -> None:
    logger.info(
        "Skipping FCM push for offer %s (no production FCM client configured)",
        getattr(offer, "id", offer),
    )

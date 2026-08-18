from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import firebase_admin
from firebase_admin import credentials, messaging

logger = logging.getLogger(__name__)

_OFFER_TITLE = "Nueva oferta"
_OFFER_BODY = "Tienes un nuevo pedido. Ábrelo para aceptar."
_CHANNEL_ID = "offers_alarm"

_initialized = False
_sent_offer_ids: set[str] = set()


def reset_firebase_for_tests() -> None:
    global _initialized
    _initialized = False
    _sent_offer_ids.clear()


def is_firebase_ready() -> bool:
    return _initialized and bool(firebase_admin._apps)


def init_firebase(
    *,
    credentials_path: str | None = None,
    credentials_json: str | None = None,
) -> bool:
    global _initialized
    if is_firebase_ready():
        return True
    cred = None
    if credentials_json and credentials_json.strip():
        cred = credentials.Certificate(json.loads(credentials_json))
    elif credentials_path:
        path = Path(credentials_path)
        if not path.is_file():
            logger.warning("Firebase credentials file not found at %s", path)
            return False
        cred = credentials.Certificate(str(path))
    if cred is None:
        return False
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    _initialized = True
    logger.info("Firebase Admin initialized for FCM")
    return True


def build_offer_message(*, token: str, offer_id: str) -> messaging.Message:
    collapse_key = f"offer:{offer_id}"
    return messaging.Message(
        token=token,
        notification=messaging.Notification(title=_OFFER_TITLE, body=_OFFER_BODY),
        data={"type": "offer", "offer_id": str(offer_id)},
        android=messaging.AndroidConfig(
            collapse_key=collapse_key,
            priority="high",
            notification=messaging.AndroidNotification(
                channel_id=_CHANNEL_ID,
                priority="max",
                sound="bells",
                tag=str(offer_id),
                default_sound=False,
                default_vibrate_timings=False,
                vibrate_timings_millis=[
                    0, 500, 160, 500, 160, 700, 160, 500, 160, 500, 160, 900,
                ],
            ),
        ),
        apns=messaging.APNSConfig(
            headers={"apns-priority": "10", "apns-collapse-id": collapse_key},
            payload=messaging.APNSPayload(
                aps=messaging.Aps(sound="default", content_available=True),
            ),
        ),
    )


def send_fcm_offer(driver: Any, offer: Any) -> None:
    token = getattr(driver, "fcm_token", None)
    if not token:
        return
    if not is_firebase_ready():
        logger.info(
            "Skipping FCM push for offer %s (no production FCM client configured)",
            getattr(offer, "id", offer),
        )
        return
    offer_id = str(getattr(offer, "id", ""))
    if offer_id and offer_id in _sent_offer_ids:
        logger.info("Skipping duplicate FCM for offer %s", offer_id)
        return
    try:
        message_id = messaging.send(build_offer_message(token=str(token), offer_id=offer_id))
        if offer_id:
            _sent_offer_ids.add(offer_id)
        logger.info("FCM sent for offer %s (%s)", offer_id, message_id)
    except Exception:
        logger.exception("FCM send failed for offer %s", offer_id)

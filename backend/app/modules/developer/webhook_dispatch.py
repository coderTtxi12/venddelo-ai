from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from datetime import UTC, datetime
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models.delivery import DeliveryDispatchRequest, DeliveryDriver
from app.db.models.developer import RestaurantTrackingWebhook
from app.db.models.orders import Order
from app.db.models.restaurant import Restaurant
from app.db.session import SessionLocal
from app.infra.storage.factory import build_storage
from app.modules.developer.crypto import sign_webhook_payload
from app.modules.developer.webhook_sink import get_webhook_sink_store
from app.modules.delivery_dispatch.tracking_view import LIVE_TRACKING_STATUSES, build_public_tracking_dto

logger = logging.getLogger(__name__)

# Rider app posts location every ~5s; match webhook cadence (per active request).
_LOCATION_THROTTLE_SECONDS = 5.0
_location_last_sent: dict[str, float] = {}
_location_lock = threading.Lock()

WEBHOOK_TIMEOUT_SECONDS = 8.0


def enqueue_tracking_status_webhook(request_id: uuid.UUID) -> None:
    threading.Thread(
        target=_deliver_status,
        args=(request_id,),
        name=f"tracking-webhook-status-{request_id}",
        daemon=True,
    ).start()


def enqueue_tracking_location_webhooks(driver_id: uuid.UUID) -> None:
    threading.Thread(
        target=_deliver_location_for_driver,
        args=(driver_id,),
        name=f"tracking-webhook-location-{driver_id}",
        daemon=True,
    ).start()


def deliver_test_webhook(restaurant_id: uuid.UUID) -> tuple[bool, int | None, str | None]:
    session = SessionLocal()
    try:
        webhook = session.get(RestaurantTrackingWebhook, restaurant_id)
        if webhook is None or not webhook.url or not webhook.signing_secret:
            return False, None, "Configura URL y secreto de firma"
        payload = _envelope(
            event_type="tracking.test",
            data={
                "message": "Evento de prueba desde Venddelo",
                "restaurant_id": str(restaurant_id),
            },
        )
        return _post_json(
            webhook.url,
            webhook.signing_secret,
            payload,
            restaurant_id=restaurant_id,
        )
    finally:
        session.close()


def _deliver_status(request_id: uuid.UUID) -> None:
    session = SessionLocal()
    try:
        request = session.scalar(
            select(DeliveryDispatchRequest)
            .options(selectinload(DeliveryDispatchRequest.assigned_driver))
            .where(DeliveryDispatchRequest.id == request_id)
        )
        if request is None:
            return
        webhook = session.get(RestaurantTrackingWebhook, request.restaurant_id)
        if not _webhook_ready(webhook, notify_status=True):
            return
        restaurant = session.get(Restaurant, request.restaurant_id)
        order = session.get(Order, request.order_id) if request.order_id else None
        tracking = build_public_tracking_dto(
            request,
            driver=request.assigned_driver,
            restaurant=restaurant,
            storage=build_storage(),
            order_delivery_address=order.delivery_address if order else None,
        )
        payload = _envelope(
            event_type="tracking.status_changed",
            data={
                "tracking_token": request.tracking_token,
                "request_id": str(request.id),
                "tracking": tracking.model_dump(mode="json"),
            },
        )
        _post_json(
            webhook.url,
            webhook.signing_secret,
            payload,
            restaurant_id=request.restaurant_id,
        )
    except Exception:
        logger.exception("tracking status webhook failed for request %s", request_id)
    finally:
        session.close()


def _deliver_location_for_driver(driver_id: uuid.UUID) -> None:
    session = SessionLocal()
    try:
        driver = session.get(DeliveryDriver, driver_id)
        if driver is None or driver.last_lat is None or driver.last_lng is None:
            return
        requests = session.scalars(
            select(DeliveryDispatchRequest).where(
                DeliveryDispatchRequest.assigned_driver_id == driver_id,
                DeliveryDispatchRequest.status.in_(tuple(LIVE_TRACKING_STATUSES)),
            )
        ).all()
        if not requests:
            return
        for request in requests:
            webhook = session.get(RestaurantTrackingWebhook, request.restaurant_id)
            if not _webhook_ready(webhook, notify_location=True):
                continue
            throttle_key = f"{request.restaurant_id}:{request.id}"
            now = time.monotonic()
            with _location_lock:
                last = _location_last_sent.get(throttle_key, 0.0)
                if now - last < _LOCATION_THROTTLE_SECONDS:
                    continue
                _location_last_sent[throttle_key] = now
            payload = _envelope(
                event_type="tracking.location_updated",
                data={
                    "tracking_token": request.tracking_token,
                    "request_id": str(request.id),
                    "status": request.status,
                    "latitude": driver.last_lat,
                    "longitude": driver.last_lng,
                    "location_updated_at": (
                        driver.location_updated_at.isoformat()
                        if driver.location_updated_at
                        else None
                    ),
                },
            )
            _post_json(
                webhook.url,
                webhook.signing_secret,
                payload,
                restaurant_id=request.restaurant_id,
            )
    except Exception:
        logger.exception("tracking location webhook failed for driver %s", driver_id)
    finally:
        session.close()


def _webhook_ready(
    webhook: RestaurantTrackingWebhook | None,
    *,
    notify_status: bool = False,
    notify_location: bool = False,
) -> bool:
    if webhook is None or not webhook.is_enabled or not webhook.url or not webhook.signing_secret:
        return False
    if notify_status and not webhook.notify_status:
        return False
    if notify_location and not webhook.notify_location:
        return False
    return True


def _envelope(event_type: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": event_type,
        "created_at": datetime.now(UTC).isoformat(),
        "data": data,
    }


def sent_events_key(restaurant_id: uuid.UUID) -> str:
    return f"sent:{restaurant_id}"


def _post_json(
    url: str,
    signing_secret: str,
    payload: dict[str, Any],
    *,
    restaurant_id: uuid.UUID | None = None,
) -> tuple[bool, int | None, str | None]:
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    timestamp = int(time.time())
    signature = sign_webhook_payload(signing_secret, body, timestamp)
    req = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Venddelo-Tracking-Webhooks/1.0",
            "X-Venddelo-Event-Id": payload["id"],
            "X-Venddelo-Event-Type": payload["type"],
            "X-Venddelo-Timestamp": str(timestamp),
            "X-Venddelo-Signature": signature,
        },
    )
    try:
        with urlopen(req, timeout=WEBHOOK_TIMEOUT_SECONDS) as resp:
            code = resp.getcode()
            ok, status_code, error = 200 <= code < 300, code, None
    except HTTPError as exc:
        ok, status_code, error = False, exc.code, exc.reason
    except URLError as exc:
        ok, status_code, error = False, None, str(exc.reason)
    except Exception as exc:
        ok, status_code, error = False, None, str(exc)
    if restaurant_id is not None:
        get_webhook_sink_store().record(
            sent_events_key(restaurant_id),
            headers={"x-venddelo-event-type": str(payload.get("type") or "")},
            body=payload,
            signature_valid=ok,
        )
    return ok, status_code, error

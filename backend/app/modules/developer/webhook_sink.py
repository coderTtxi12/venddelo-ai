from __future__ import annotations

import json
import threading
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.modules.developer.crypto import sign_webhook_payload

_MAX_EVENTS_PER_SINK = 50


@dataclass(frozen=True)
class WebhookSinkEvent:
    received_at: str
    headers: dict[str, str]
    body: dict[str, Any]
    signature_valid: bool | None


class WebhookSinkStore:
    def __init__(self) -> None:
        self._events: dict[str, deque[WebhookSinkEvent]] = {}
        self._lock = threading.Lock()

    def record(
        self,
        sink_token: str,
        *,
        headers: dict[str, str],
        body: dict[str, Any],
        signature_valid: bool | None,
    ) -> None:
        event = WebhookSinkEvent(
            received_at=datetime.now(UTC).isoformat(),
            headers=headers,
            body=body,
            signature_valid=signature_valid,
        )
        with self._lock:
            bucket = self._events.setdefault(sink_token, deque(maxlen=_MAX_EVENTS_PER_SINK))
            bucket.appendleft(event)

    def list_events(self, sink_token: str, limit: int = 20) -> list[WebhookSinkEvent]:
        capped = max(1, min(limit, _MAX_EVENTS_PER_SINK))
        with self._lock:
            bucket = self._events.get(sink_token)
            if bucket is None:
                return []
            return list(bucket)[:capped]


_sink_store = WebhookSinkStore()


def get_webhook_sink_store() -> WebhookSinkStore:
    return _sink_store


def verify_incoming_signature(
    signing_secret: str | None,
    headers: dict[str, str],
    raw_body: bytes,
) -> bool | None:
    if not signing_secret:
        return None
    timestamp = headers.get("x-venddelo-timestamp") or headers.get("X-Venddelo-Timestamp")
    signature = headers.get("x-venddelo-signature") or headers.get("X-Venddelo-Signature")
    if not timestamp or not signature:
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    expected = sign_webhook_payload(signing_secret, raw_body, ts)
    return expected == signature


def parse_json_body(raw: bytes) -> dict[str, Any]:
    if not raw:
        return {}
    parsed = json.loads(raw.decode())
    if isinstance(parsed, dict):
        return parsed
    return {"_value": parsed}

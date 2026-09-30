from __future__ import annotations

import json
import uuid
from unittest.mock import patch

from app.modules.developer.crypto import generate_api_key, sign_webhook_payload
from app.modules.developer.webhook_dispatch import _envelope, _post_json


def test_sign_webhook_payload_is_stable():
    body = b'{"type":"tracking.test"}'
    sig = sign_webhook_payload("whsec_test", body, 1_700_000_000)
    assert sig.startswith("sha256=")
    assert len(sig) > 20


def test_generate_api_key_prefix():
    full, prefix, key_hash = generate_api_key()
    assert full.startswith("mexy_dev_")
    assert full.startswith(prefix)
    assert len(key_hash) == 64


def test_post_json_sends_signature_headers():
    captured: dict = {}

    class FakeResp:
        def getcode(self) -> int:
            return 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(req, timeout=0):
        captured["headers"] = dict(req.header_items())
        captured["body"] = req.data
        return FakeResp()

    payload = _envelope("tracking.test", {"ok": True})
    with patch("app.modules.developer.webhook_dispatch.urlopen", fake_urlopen):
        ok, code, err = _post_json("https://example.com/hook", "whsec_x", payload)
    assert ok is True
    assert code == 200
    assert err is None
    headers = {k.lower(): v for k, v in captured["headers"].items()}
    assert headers["x-venddelo-event-type"] == "tracking.test"
    assert headers["x-venddelo-signature"].startswith("sha256=")
    assert json.loads(captured["body"].decode())["type"] == "tracking.test"


def test_enqueue_status_calls_thread(monkeypatch):
    from app.modules.developer import webhook_dispatch

    started: list[uuid.UUID] = []

    class ImmediateThread:
        def __init__(self, target, args=(), name=None, daemon=None):
            self._target = target
            self._args = args

        def start(self):
            started.append(self._args[0])

    monkeypatch.setattr(webhook_dispatch.threading, "Thread", ImmediateThread)
    with patch.object(webhook_dispatch, "_deliver_status") as deliver:
        webhook_dispatch.enqueue_tracking_status_webhook(uuid.uuid4())
    assert len(started) == 1
    deliver.assert_not_called()

from types import SimpleNamespace
from unittest.mock import patch

from firebase_admin import messaging

from app.modules.delivery_dispatch.fcm import (
    build_offer_message,
    init_firebase,
    reset_firebase_for_tests,
    send_fcm_offer,
)
from app.modules.delivery_dispatch.notify import notify_offer, set_offer_notifier


def setup_function() -> None:
    reset_firebase_for_tests()
    set_offer_notifier(None)


def teardown_function() -> None:
    reset_firebase_for_tests()
    set_offer_notifier(None)


def test_build_offer_message_is_high_priority() -> None:
    message = build_offer_message(token="token-abc", offer_id="offer-1")

    assert message.token == "token-abc"
    assert message.notification is not None
    assert message.notification.title == "Nueva oferta"
    assert message.data == {"type": "offer", "offer_id": "offer-1"}
    assert message.android is not None
    assert message.android.priority == "high"
    assert message.android.notification is not None
    assert message.android.notification.channel_id == "offers_alarm"
    assert message.android.notification.sound == "bells"
    assert message.android.notification.priority == "max"
    assert message.android.notification.tag == "offer-1"
    assert message.android.collapse_key == "offer:offer-1"


def test_init_firebase_skips_without_credentials() -> None:
    assert init_firebase(credentials_path=None, credentials_json=None) is False


def test_send_fcm_offer_skips_when_firebase_is_not_configured(caplog) -> None:
    caplog.set_level("INFO")
    send_fcm_offer(SimpleNamespace(fcm_token="token-abc"), SimpleNamespace(id="offer-1"))
    assert "no production FCM client configured" in caplog.text


def test_send_fcm_offer_sends_when_firebase_is_ready() -> None:
    with (
        patch("app.modules.delivery_dispatch.fcm.is_firebase_ready", return_value=True),
        patch("app.modules.delivery_dispatch.fcm.messaging.send", return_value="msg-1") as send,
    ):
        send_fcm_offer(SimpleNamespace(fcm_token="token-abc"), SimpleNamespace(id="offer-1"))

    send.assert_called_once()
    sent = send.call_args.args[0]
    assert isinstance(sent, messaging.Message)
    assert sent.token == "token-abc"
    assert sent.data["offer_id"] == "offer-1"


def test_send_fcm_offer_skips_duplicate_for_same_offer() -> None:
    with (
        patch("app.modules.delivery_dispatch.fcm.is_firebase_ready", return_value=True),
        patch("app.modules.delivery_dispatch.fcm.messaging.send", return_value="msg-1") as send,
    ):
        driver = SimpleNamespace(fcm_token="token-abc")
        offer = SimpleNamespace(id="offer-dup")
        send_fcm_offer(driver, offer)
        send_fcm_offer(driver, offer)

    send.assert_called_once()


def test_notify_offer_uses_fcm_by_default() -> None:
    with patch("app.modules.delivery_dispatch.notify.send_fcm_offer") as send:
        notify_offer(SimpleNamespace(fcm_token="token-abc"), SimpleNamespace(id="offer-1"))
    send.assert_called_once()


def test_notify_offer_logs_when_driver_has_no_token(caplog) -> None:
    caplog.set_level("INFO")
    with patch("app.modules.delivery_dispatch.notify.send_fcm_offer") as send:
        notify_offer(SimpleNamespace(fcm_token=None, id="drv-1"), SimpleNamespace(id="offer-1"))
    send.assert_not_called()
    assert "no fcm_token" in caplog.text

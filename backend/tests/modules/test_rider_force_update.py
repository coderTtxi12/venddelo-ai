"""Force-update: GET /rider/me tells current APKs to stop until they install the next one."""

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.modules.delivery_dispatch.app_client import force_update_payload, must_update_app
from app.modules.delivery_dispatch.service import RiderDispatchService
from app.modules.users.schemas import UserDTO


def test_must_update_when_build_missing_or_below_min():
    assert must_update_app(None, min_build=2) is True
    assert must_update_app(1, min_build=2) is True
    assert must_update_app(2, min_build=2) is False
    assert must_update_app(3, min_build=2) is False


def test_force_update_payload_includes_apk_url_only_when_blocked():
    must, url = force_update_payload(
        1,
        min_build=2,
        apk_url="https://cdn.example.com/mexy-rider.apk",
    )
    assert must is True
    assert url == "https://cdn.example.com/mexy-rider.apk"

    current_must, current_url = force_update_payload(
        2,
        min_build=2,
        apk_url="https://cdn.example.com/mexy-rider.apk",
    )
    assert current_must is False
    assert current_url is None


def test_force_update_payload_allows_block_without_url():
    must, url = force_update_payload(1, min_build=3, apk_url="  ")
    assert must is True
    assert url is None


def _user(driver_user_id: uuid.UUID) -> UserDTO:
    return UserDTO(
        id=driver_user_id,
        email="rider@example.com",
        display_name=None,
        avatar_url=None,
        role="owner",
        plan="free",
        billing_customer_id=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def test_get_me_stores_build_and_forces_offline_when_stale(monkeypatch):
    session = MagicMock()
    service = RiderDispatchService(session)
    driver = SimpleNamespace(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        is_online=True,
        app_version=None,
        app_build_number=None,
        delivery_provider_id=uuid.uuid4(),
    )
    monkeypatch.setattr(service, "_require_driver", lambda _user: driver)
    monkeypatch.setattr(service, "_to_profile", lambda _driver: SimpleNamespace())
    monkeypatch.setattr(
        "app.modules.delivery_dispatch.service.notify_dispatch_monitor_changed",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "app.modules.delivery_dispatch.service.notify_rider_updated",
        lambda *_a, **_k: None,
    )

    service.get_me(_user(driver.user_id), app_version="1.0.0", app_build_number=1)

    assert driver.app_version == "1.0.0"
    assert driver.app_build_number == 1
    assert driver.is_online is False
    session.flush.assert_called_once()


def test_get_me_keeps_online_when_build_is_current(monkeypatch):
    session = MagicMock()
    service = RiderDispatchService(session)
    driver = SimpleNamespace(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        is_online=True,
        app_version=None,
        app_build_number=None,
        delivery_provider_id=uuid.uuid4(),
    )
    monkeypatch.setattr(service, "_require_driver", lambda _user: driver)
    monkeypatch.setattr(service, "_to_profile", lambda _driver: SimpleNamespace())

    service.get_me(_user(driver.user_id), app_version="1.0.1", app_build_number=2)

    assert driver.app_build_number == 2
    assert driver.is_online is True


def test_set_online_rejects_stale_app(monkeypatch):
    from app.core.exceptions import ValidationError

    session = MagicMock()
    service = RiderDispatchService(session)
    driver = SimpleNamespace(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        is_online=False,
        app_version=None,
        app_build_number=None,
        delivery_provider_id=uuid.uuid4(),
    )
    monkeypatch.setattr(service, "_require_driver", lambda _user: driver)

    try:
        service.set_online(
            _user(driver.user_id),
            True,
            app_version="1.0.0",
            app_build_number=1,
        )
    except ValidationError as error:
        assert "Actualiza la app" in error.message
    else:
        raise AssertionError("expected ValidationError")
    assert driver.is_online is False

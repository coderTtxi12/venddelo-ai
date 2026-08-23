import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.modules.delivery_dispatch import monitor_notify


def test_notify_rider_updated_includes_credit(monkeypatch):
    published: list[dict] = []
    monkeypatch.setattr(
        monitor_notify.get_rider_realtime_hub(),
        "publish_sync",
        lambda driver_id, payload: published.append({"driver_id": driver_id, **payload}),
    )

    driver_id = uuid.uuid4()
    monitor_notify.notify_rider_updated(
        driver_id,
        credit_limit_cents=50000,
        credit_held_cents=0,
    )

    assert published == [
        {
            "driver_id": driver_id,
            "type": "rider.updated",
            "credit_limit_cents": 50000,
            "credit_held_cents": 0,
        }
    ]


def test_notify_request_realtime_publishes_restaurant_after_commit(monkeypatch):
    published: list[dict] = []
    listeners: dict[str, object] = {}

    monkeypatch.setattr(
        monitor_notify,
        "notify_dispatch_monitor_changed",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        monitor_notify.get_restaurant_dispatch_realtime_hub(),
        "publish_sync",
        lambda restaurant_id, payload: published.append(
            {"restaurant_id": restaurant_id, **payload}
        ),
    )
    monkeypatch.setattr(
        monitor_notify.get_rider_realtime_hub(),
        "publish_sync",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        monitor_notify.event,
        "listen",
        lambda _session, name, fn, once=False: listeners.update({name: fn}),
    )

    restaurant_id = uuid.uuid4()
    request_id = uuid.uuid4()
    request = SimpleNamespace(
        id=request_id,
        delivery_provider_id=uuid.uuid4(),
        restaurant_id=restaurant_id,
        status="assigned",
        assigned_driver_id=None,
        assigned_driver=None,
    )
    session = SimpleNamespace(in_transaction=lambda: True, info={}, get=MagicMock())

    monitor_notify.notify_request_realtime(session, request)

    assert published == []

    listeners["after_commit"](session)

    assert published == [
        {
            "restaurant_id": restaurant_id,
            "type": "dispatch.updated",
            "request_id": str(request_id),
            "status": "assigned",
        }
    ]


def test_notify_request_realtime_sends_released_credit(monkeypatch):
    published: list[dict] = []
    monkeypatch.setattr(
        monitor_notify,
        "notify_dispatch_monitor_changed",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        monitor_notify.get_restaurant_dispatch_realtime_hub(),
        "publish_sync",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        monitor_notify.get_rider_realtime_hub(),
        "publish_sync",
        lambda driver_id, payload: published.append({"driver_id": driver_id, **payload}),
    )

    driver = SimpleNamespace(
        id=uuid.uuid4(),
        credit_limit_cents=50000,
        credit_held_cents=0,
    )
    request = SimpleNamespace(
        id=uuid.uuid4(),
        delivery_provider_id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        status="assigned",
        assigned_driver_id=driver.id,
        assigned_driver=driver,
    )
    session = SimpleNamespace(in_transaction=lambda: False, get=MagicMock())

    monitor_notify.notify_request_realtime(session, request)

    assert published == [
        {
            "driver_id": driver.id,
            "type": "rider.updated",
            "credit_limit_cents": 50000,
            "credit_held_cents": 0,
        }
    ]

"""Location ping stays cheap; itinerary PATCH notifies the rider app."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.modules.delivery_dispatch.service import DeliveryDispatchService, RiderDispatchService
from app.modules.users.schemas import UserDTO


def test_require_driver_skips_claim_when_already_linked(monkeypatch):
    session = MagicMock()
    service = RiderDispatchService(session)
    driver = SimpleNamespace(id=uuid.uuid4(), user_id=uuid.uuid4())
    user = UserDTO(
        id=driver.user_id,
        email="rider@example.com",
        display_name=None,
        avatar_url=None,
        role="owner",
        plan="free",
        billing_customer_id=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    claimed = {"n": 0}

    def fake_claim(*_args, **_kwargs):
        claimed["n"] += 1

    monkeypatch.setattr(
        "app.modules.delivery_dispatch.service.claim_drivers",
        fake_claim,
    )
    monkeypatch.setattr(service, "_driver_for_user", lambda _uid: driver)

    assert service._require_driver(user) is driver
    assert claimed["n"] == 0


def test_update_location_does_not_build_profile(monkeypatch):
    session = MagicMock()
    service = RiderDispatchService(session)
    driver = SimpleNamespace(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        last_lat=None,
        last_lng=None,
        location_updated_at=None,
        delivery_provider_id=uuid.uuid4(),
    )
    user = UserDTO(
        id=driver.user_id,
        email="rider@example.com",
        display_name=None,
        avatar_url=None,
        role="owner",
        plan="free",
        billing_customer_id=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    profile_calls = {"n": 0}
    notified = {"n": 0}

    monkeypatch.setattr(service, "_require_driver", lambda _user: driver)
    monkeypatch.setattr(
        service,
        "_to_profile",
        lambda _driver: profile_calls.__setitem__("n", profile_calls["n"] + 1),
    )
    monkeypatch.setattr(
        "app.modules.delivery_dispatch.service.notify_driver_location_realtime",
        lambda *_a, **_k: notified.__setitem__("n", notified["n"] + 1),
    )

    assert service.update_location(user, 19.43, -99.13) is None
    assert driver.last_lat == 19.43
    assert driver.last_lng == -99.13
    assert driver.location_updated_at is not None
    assert notified["n"] == 1
    assert profile_calls["n"] == 0
    session.flush.assert_called_once()


def test_update_driver_itinerary_notifies_rider(monkeypatch):
    session = MagicMock()
    service = DeliveryDispatchService(session, MagicMock(), MagicMock())
    provider_id = uuid.uuid4()
    driver_id = uuid.uuid4()
    request_id = uuid.uuid4()
    driver = SimpleNamespace(id=driver_id, delivery_provider_id=provider_id)

    session.scalar.return_value = driver

    from app.modules.delivery_dispatch.itinerary import ItineraryStop
    from app.modules.delivery_dispatch.schemas import ItineraryStopInput, ItineraryUpdate

    plan = [
        ItineraryStop(kind="restaurant", request_id=str(request_id)),
        ItineraryStop(kind="dropoff", request_id=str(request_id)),
    ]
    monkeypatch.setattr(
        "app.modules.delivery_dispatch.service.load_plan",
        lambda *_a, **_k: list(plan),
    )
    monkeypatch.setattr(
        "app.modules.delivery_dispatch.service.replace_plan",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "app.modules.delivery_dispatch.service.hydrate_itinerary",
        lambda *_a, **_k: [],
    )
    monkeypatch.setattr(
        service,
        "_require_provider_with_role",
        lambda _uid: (provider_id, "owner"),
    )
    monkeypatch.setattr(
        "app.modules.delivery_dispatch.service.require_manage_partnerships",
        lambda _role: None,
    )

    events: list[tuple[str, uuid.UUID]] = []
    monkeypatch.setattr(
        "app.modules.delivery_dispatch.service.notify_dispatch_monitor_changed",
        lambda pid: events.append(("monitor", pid)),
    )
    monkeypatch.setattr(
        "app.modules.delivery_dispatch.service.notify_rider_updated",
        lambda did: events.append(("rider", did)),
    )

    data = ItineraryUpdate(
        stops=[
            ItineraryStopInput(kind="restaurant", request_id=request_id),
            ItineraryStopInput(kind="dropoff", request_id=request_id),
        ]
    )
    service.update_driver_itinerary(uuid.uuid4(), driver_id, data)

    assert ("monitor", provider_id) in events
    assert ("rider", driver_id) in events

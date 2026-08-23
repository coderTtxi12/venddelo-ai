from types import SimpleNamespace
import uuid

from app.modules.delivery_providers.service import DeliveryProviderService


def test_notify_zone_delivery_service_publishes_monitor(monkeypatch):
    published: list[uuid.UUID] = []
    restaurants: list[list[uuid.UUID]] = []
    monkeypatch.setattr(
        "app.modules.delivery_providers.service.notify_dispatch_monitor_changed",
        lambda provider_id: published.append(provider_id),
    )
    monkeypatch.setattr(
        "app.modules.delivery_providers.service.notify_restaurants_delivery_service_updated",
        lambda ids: restaurants.append(list(ids)),
    )

    provider_id = uuid.uuid4()
    zone_id = uuid.uuid4()
    restaurant_id = uuid.uuid4()
    service = DeliveryProviderService(
        repo=SimpleNamespace(
            list_active_partnership_requests=lambda *_args, **_kwargs: [
                SimpleNamespace(restaurant=SimpleNamespace(id=restaurant_id)),
            ],
        ),
        storage=SimpleNamespace(),
    )

    service._notify_zone_delivery_service(provider_id, zone_id)

    assert published == [provider_id]
    assert restaurants == [[restaurant_id]]

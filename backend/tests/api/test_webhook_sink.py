from __future__ import annotations

import uuid

from sqlalchemy.orm import sessionmaker

from app.db.models.developer import RestaurantTrackingWebhook
from tests.api.test_api_v1 import AUTH
from tests.conftest import requires_db


@requires_db
def test_webhook_sink_records_post(client, engine):
    created = client.post(
        "/api/v1/restaurants",
        json={"name": "Webhook Test", "subdomain": "webhook-test-cafe"},
        headers=AUTH,
    )
    assert created.status_code == 201
    restaurant_id = created.json()["id"]

    dev = client.get(f"/api/v1/restaurants/{restaurant_id}/developer", headers=AUTH)
    assert dev.status_code == 200
    assert "test_sink" not in dev.json()
    session = sessionmaker(bind=engine)()
    try:
        row = session.get(RestaurantTrackingWebhook, uuid.UUID(restaurant_id))
        assert row is not None
        sink_token = row.sink_token
    finally:
        session.close()
    post_url = f"/api/v1/public/webhook-sink/{sink_token}"
    events_url = f"{post_url}/events"

    rotate = client.post(
        f"/api/v1/restaurants/{restaurant_id}/developer/webhook/rotate-secret",
        headers=AUTH,
    )
    assert rotate.status_code == 200

    updated = client.put(
        f"/api/v1/restaurants/{restaurant_id}/developer/webhook",
        headers=AUTH,
        json={"url": post_url, "is_enabled": True},
    )
    assert updated.status_code == 200

    test = client.post(
        f"/api/v1/restaurants/{restaurant_id}/developer/webhook/test",
        headers=AUTH,
    )
    assert test.status_code == 200
    assert test.json()["ok"] is True

    listed = client.get(events_url)
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert len(items) >= 1
    assert items[0]["body"]["type"] == "tracking.test"
    assert items[0]["signature_valid"] is True

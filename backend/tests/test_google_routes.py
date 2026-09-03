import json
from unittest.mock import patch

import pytest

from app.infra.maps.google_routes import (
    RoutesError,
    fetch_driving_distance_km,
    shortest_route_meters,
)


def test_shortest_route_meters_prefers_shorter_distance_label():
    meters = shortest_route_meters(
        [
            {"distanceMeters": 8000, "routeLabels": ["DEFAULT_ROUTE"]},
            {"distanceMeters": 5200, "routeLabels": ["SHORTER_DISTANCE"]},
        ]
    )
    assert meters == 5200


def test_shortest_route_meters_falls_back_to_min_when_label_missing():
    meters = shortest_route_meters(
        [
            {"distanceMeters": 9100, "routeLabels": ["DEFAULT_ROUTE"]},
            {"distanceMeters": 7400, "routeLabels": ["DEFAULT_ROUTE_ALTERNATE"]},
        ]
    )
    assert meters == 7400


def test_shortest_route_meters_rejects_empty_routes():
    with pytest.raises(RoutesError):
        shortest_route_meters([])


def test_fetch_driving_distance_km_posts_essentials_shorter_distance_request():
    payload = {
        "routes": [
            {"distanceMeters": 8000, "routeLabels": ["DEFAULT_ROUTE"]},
            {"distanceMeters": 5123, "routeLabels": ["SHORTER_DISTANCE"]},
        ]
    }
    captured: dict = {}

    class FakeResponse:
        def read(self):
            return json.dumps(payload).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout=0):
        captured["url"] = request.full_url
        captured["method"] = request.get_method()
        captured["headers"] = {key.lower(): value for key, value in request.header_items()}
        captured["body"] = json.loads(request.data.decode())
        captured["timeout"] = timeout
        return FakeResponse()

    with patch(
        "app.infra.maps.google_routes.urllib.request.urlopen",
        side_effect=fake_urlopen,
    ):
        km = fetch_driving_distance_km(
            origin_lat=19.43,
            origin_lng=-99.13,
            destination_lat=19.45,
            destination_lng=-99.12,
            api_key="test-key",
        )

    assert km == 5.12
    assert captured["url"] == "https://routes.googleapis.com/directions/v2:computeRoutes"
    assert captured["method"] == "POST"
    assert captured["body"]["travelMode"] == "DRIVE"
    assert captured["body"]["routingPreference"] == "TRAFFIC_UNAWARE"
    assert captured["body"]["requestedReferenceRoutes"] == ["SHORTER_DISTANCE"]
    assert captured["body"].get("travelMode") != "TWO_WHEELER"
    assert "routes.distanceMeters" in captured["headers"]["x-goog-fieldmask"]
    assert "routes.routeLabels" in captured["headers"]["x-goog-fieldmask"]
    assert captured["headers"]["x-goog-api-key"] == "test-key"
    assert captured["timeout"] == 10

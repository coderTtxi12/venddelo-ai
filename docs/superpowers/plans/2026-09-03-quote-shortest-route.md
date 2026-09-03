# Quote shortest driving km Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Outside-polygon delivery quotes use Google Routes `SHORTER_DISTANCE` (DRIVE, TRAFFIC_UNAWARE) instead of Distance Matrix recommended route.

**Architecture:** Replace `backend/app/infra/maps/google_distance_matrix.py` with a Routes `computeRoutes` client that keeps `fetch_driving_distance_km(...)` so `PublicDeliveryQuoteService` still calls it only when `inside_polygon` is false. Rider app is untouched.

**Tech Stack:** Python 3, stdlib `urllib`, Google Routes API v2, pytest.

## Global Constraints

- Only quoting, only outside polygon
- `travelMode: DRIVE`, `routingPreference: TRAFFIC_UNAWARE`, `requestedReferenceRoutes: ["SHORTER_DISTANCE"]`
- Do not modify `apps/rider/`
- Do not commit unless the user asks
- Keep existing quote error copy when routing fails
- Essentials SKU only: no traffic-aware, no two-wheeler

---

### Task 1: Routes client selects shortest km

**Files:**
- Create: `backend/tests/test_google_routes.py`
- Create: `backend/app/infra/maps/google_routes.py`
- Delete: `backend/app/infra/maps/google_distance_matrix.py`
- Modify: `backend/app/modules/public/delivery_quote_service.py` (import path + exception name)

**Interfaces:**
- Consumes: origin/destination lat/lng, Google API key
- Produces: `RoutesError`; `fetch_driving_distance_km(*, origin_lat, origin_lng, destination_lat, destination_lng, api_key) -> float`; `shortest_route_meters(routes) -> int`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_google_routes.py
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
        captured["headers"] = {k.lower(): v for k, v in request.header_items()}
        captured["body"] = json.loads(request.data.decode())
        captured["timeout"] = timeout
        return FakeResponse()

    with patch("app.infra.maps.google_routes.urllib.request.urlopen", side_effect=fake_urlopen):
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
    assert "TWO_WHEELER" not in str(captured["body"])
    assert captured["timeout"] == 10
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_google_routes.py -v`

Expected: FAIL (module `app.infra.maps.google_routes` missing)

- [ ] **Step 3: Implement `google_routes.py` and switch the quote import**

Keep `fetch_driving_distance_km` name. Quote service currently catches `DistanceMatrixError`; catch `RoutesError` instead (or alias). Field mask: `routes.distanceMeters,routes.routeLabels,routes.routeToken`. POST JSON with origin/destination latLng. On HTTP/JSON/empty routes raise `RoutesError` with the same user-facing idea as today (“No se pudo calcular la ruta”).

Delete `google_distance_matrix.py`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_google_routes.py tests/modules/test_public_delivery_quote_service.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

Skip unless the user asks.

---

### Task 2: Operator copy and env comment

**Files:**
- Modify: `delivery-dashboard/src/components/pages/TariffsPage.tsx` subtitle mentioning Distance Matrix
- Modify: `backend/.env.example` comment on `GOOGLE_MAPS_API_KEY`

**Interfaces:**
- Consumes: Task 1 behavior
- Produces: Accurate operator-facing copy; same API key env var

- [ ] **Step 1: Update strings**

Tariffs subtitle: say Google Routes, shortest driving km, max 20 km restaurant → customer.

`.env.example`: Routes API (Compute Routes) for outside-polygon quotes.

- [ ] **Step 2: Confirm rider app untouched**

`git diff -- apps/rider` must be empty.

- [ ] **Step 3: Commit**

Skip unless the user asks.

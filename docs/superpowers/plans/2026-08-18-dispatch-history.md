# Dispatch History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rider account screen and delivery-dashboard `/historial` list delivered and cancelled dispatch requests for a calendar period, with earnings and credit on the rider side and full operational fields on the company side.

**Architecture:** Pure date-range helper plus `list_dispatch_history` in `delivery_dispatch/history.py`. Two HTTP surfaces (`GET /rider/me/history` and `GET /delivery-providers/me/dispatch-history`) share that query. Live `GET /rider/me` stays active-assignments-only. Flutter `AccountScreen` and Next `HistoryPage` are new files; home map only swaps logout for an account button.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, Flutter, Next.js (delivery-dashboard), CSS modules, MUI icons.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-dispatch-history-design.es.md`
- Statuses: `delivered` and `cancelled` only. No `unassigned`.
- Dates: calendar **Hoy / Semana / Mes / Rango** in `America/Mexico_City`. API `start`/`end` are `YYYY-MM-DD` inclusive; server converts to UTC `[start 00:00, end+1 00:00)`.
- Week: Monday 00:00 through Sunday end (exclusive next Monday 00:00) of the week containing today.
- `closed_at = coalesce(cancelled_at, updated_at)`. No `delivered_at` column.
- Earnings: sum of `quoted_fee_cents` for **delivered** rows in the full filtered range, not the current page.
- Rider endpoint must **not** declare `driver_id`.
- Do not inflate `GET /rider/me` with history.
- UI: existing `AppColors` / panel tokens. No emoji icons. No EB Garamond.
- Copy: empty rider “Aún no hay pedidos en este periodo.” Dashboard “No hay pedidos cerrados en este periodo.” Network errors use existing Wi‑Fi message.
- Do not commit unless the user asks.
- TDD: failing test first; watch it fail; then implement.

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/modules/delivery_dispatch/history.py` | Mexico City range + SQL list/serialize |
| `backend/app/modules/delivery_dispatch/schemas.py` | History DTOs |
| `backend/app/modules/delivery_dispatch/service.py` | Thin wrappers on rider + provider services |
| `backend/app/modules/delivery_dispatch/rider_api.py` | `GET /rider/me/history` |
| `backend/app/modules/delivery_dispatch/api.py` | `GET /me/dispatch-history` |
| `backend/tests/modules/test_dispatch_history_range.py` | Date conversion unit tests |
| `backend/tests/api/test_delivery_dispatch_history.py` | Rider + dashboard API tests |
| `apps/rider/lib/history_period.dart` | Calendar start/end from a local `now` |
| `apps/rider/lib/history_copy.dart` | Empty copy + status badges |
| `apps/rider/test/history_period_test.dart` | Period helper |
| `apps/rider/test/history_copy_test.dart` | Copy |
| `apps/rider/lib/models.dart` | `RiderHistoryPage` models |
| `apps/rider/lib/api.dart` | `getHistory` |
| `apps/rider/lib/screens/account_screen.dart` | Account UI |
| `apps/rider/lib/screens/home_screen.dart` | Logout → Cuenta |
| `delivery-dashboard/src/lib/api/types.ts` | History types |
| `delivery-dashboard/src/lib/api/deliveryProviders.ts` | `getMyDispatchHistory` |
| `delivery-dashboard/src/lib/dispatch/monitorCopy.ts` | `delivered` / `cancelled` labels |
| `delivery-dashboard/src/components/ui/Sidebar.tsx` | Nav item |
| `delivery-dashboard/src/app/(panel)/historial/page.tsx` | Route |
| `delivery-dashboard/src/components/pages/HistoryPage.tsx` | Page |
| `delivery-dashboard/src/components/pages/HistoryPage.module.css` | Styles |
| `delivery-dashboard/src/components/history/HistoryDetailDrawer.tsx` | Drawer |

---

### Task 1: Mexico City date range helper

**Files:**
- Create: `backend/tests/modules/test_dispatch_history_range.py`
- Create: `backend/app/modules/delivery_dispatch/history.py`

**Interfaces:**
- Produces: `mexico_city_range(start: date, end: date) -> tuple[datetime, datetime]` (UTC instants, end exclusive)

- [ ] **Step 1: Write the failing test**

```python
from datetime import date, datetime, UTC
from zoneinfo import ZoneInfo

from app.modules.delivery_dispatch.history import mexico_city_range


def test_mexico_city_range_is_inclusive_dates_exclusive_end_utc() -> None:
    start_utc, end_utc = mexico_city_range(date(2026, 8, 18), date(2026, 8, 18))
    mexico = ZoneInfo("America/Mexico_City")
    expected_start = datetime(2026, 8, 18, tzinfo=mexico).astimezone(UTC)
    expected_end = datetime(2026, 8, 19, tzinfo=mexico).astimezone(UTC)
    assert start_utc == expected_start
    assert end_utc == expected_end


def test_mexico_city_range_rejects_end_before_start() -> None:
    from app.core.exceptions import ValidationError

    try:
        mexico_city_range(date(2026, 8, 19), date(2026, 8, 18))
    except ValidationError as exc:
        assert "fecha" in exc.message.lower()
    else:
        raise AssertionError("expected ValidationError")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/modules/test_dispatch_history_range.py -v`

Expected: FAIL import error `history` / `mexico_city_range` not found.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/modules/delivery_dispatch/history.py`:

```python
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.exceptions import ValidationError

MEXICO_TZ = ZoneInfo("America/Mexico_City")
HISTORY_STATUSES = frozenset({"delivered", "cancelled"})
DEFAULT_LIMIT = 50
MAX_LIMIT = 100


def mexico_city_range(start: date, end: date) -> tuple[datetime, datetime]:
    if end < start:
        raise ValidationError("La fecha final no puede ser anterior a la inicial")
    start_local = datetime(start.year, start.month, start.day, tzinfo=MEXICO_TZ)
    end_local = datetime(end.year, end.month, end.day, tzinfo=MEXICO_TZ) + timedelta(days=1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def today_mexico() -> date:
    return datetime.now(MEXICO_TZ).date()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/modules/test_dispatch_history_range.py -v`

Expected: PASS

---

### Task 2: Rider history API

**Files:**
- Create: `backend/tests/api/test_delivery_dispatch_history.py`
- Modify: `backend/app/modules/delivery_dispatch/history.py` (add query)
- Modify: `backend/app/modules/delivery_dispatch/schemas.py`
- Modify: `backend/app/modules/delivery_dispatch/service.py` (`RiderDispatchService.get_history`)
- Modify: `backend/app/modules/delivery_dispatch/rider_api.py`

**Interfaces:**
- Consumes: `mexico_city_range`, `today_mexico`
- Produces: `GET /api/v1/rider/me/history` → `RiderHistoryPageDTO`

Reuse helpers from `tests/api/test_delivery_rider_offers.py`: `_setup_ready_rider`, `_create_and_offer`, `_as_rider`, `_as_owner`, `_as_mexy`, `AUTH`, `RIDER`. Truncate the same tables as that file’s fixture.

- [ ] **Step 1: Write failing API tests**

```python
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.db.models.delivery import DeliveryDispatchRequest
from tests.api.test_api_v1 import AUTH
from tests.api.test_delivery_rider_offers import (
    _as_mexy,
    _as_owner,
    _as_rider,
    _create_and_offer,
    _driver_payload,
    _setup_ready_rider,
)
from tests.conftest import requires_db


@pytest.fixture(autouse=True)
def _clean(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE delivery_credit_holds, delivery_dispatch_offers,
                         delivery_dispatch_requests, delivery_drivers,
                         restaurant_delivery_providers,
                         delivery_search_lead_times,
                         delivery_provider_assignment_settings,
                         delivery_provider_pricing_configs,
                         delivery_provider_payment_methods,
                         delivery_provider_schedules, delivery_provider_zones,
                         delivery_provider_members, delivery_providers,
                         restaurant_members, restaurants, users
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield
    from app.modules.delivery_dispatch.notify import set_offer_notifier
    from app.modules.delivery_dispatch.tasks import stub_bus

    stub_bus.clear()
    set_offer_notifier(None)
    _as_owner()


def _accept_and_deliver(client, engine, restaurant_id: str) -> str:
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)
    _as_rider()
    assert client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH).status_code == 200
    assert client.post(
        f"/api/v1/rider/me/assignments/{request_id}/picked-up", headers=AUTH
    ).status_code == 200
    assert client.post(
        f"/api/v1/rider/me/assignments/{request_id}/in-transit", headers=AUTH
    ).status_code == 200
    delivered = client.post(
        f"/api/v1/rider/me/assignments/{request_id}/delivered", headers=AUTH
    )
    assert delivered.status_code == 200, delivered.text
    return request_id


@requires_db
def test_delivered_leaves_me_and_appears_in_history(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id = _accept_and_deliver(client, engine, restaurant_id)

    _as_rider()
    me = client.get("/api/v1/rider/me", headers=AUTH)
    assert me.json()["assignments"] == []

    history = client.get("/api/v1/rider/me/history", headers=AUTH)
    assert history.status_code == 200, history.text
    body = history.json()
    assert [row["id"] for row in body["items"]] == [request_id]
    assert body["items"][0]["status"] == "delivered"
    assert body["items"][0]["closed_at"]
    assert body["delivered_count"] == 1
    assert body["cancelled_count"] == 0
    assert body["earnings_cents"] == body["items"][0]["quoted_fee_cents"]
    assert "driver_id" not in body
    assert body["has_more"] is False


@requires_db
def test_rider_history_includes_own_cancelled_not_others(client, engine):
    restaurant_id, driver_id = _setup_ready_rider(client, engine)
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)
    _as_rider()
    assert client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH).status_code == 200
    _as_owner()
    cancel = client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/cancel",
        headers=AUTH,
    )
    assert cancel.status_code == 200, cancel.text

    _as_mexy()
    other_driver = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=_driver_payload(email="otro@empresa.com", plate="XYZ999"),
        headers=AUTH,
    )
    assert other_driver.status_code == 201, other_driver.text
    other_driver_id = uuid.UUID(other_driver.json()["id"])

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        row = session.get(DeliveryDispatchRequest, uuid.UUID(request_id))
        assert row is not None
        clone = DeliveryDispatchRequest(
            restaurant_id=row.restaurant_id,
            delivery_provider_id=row.delivery_provider_id,
            zone_id=row.zone_id,
            customer_name="Otro",
            customer_phone="+525500000000",
            dropoff_lat=row.dropoff_lat,
            dropoff_lng=row.dropoff_lng,
            dropoff_address=row.dropoff_address,
            payment_method=row.payment_method,
            collect_cents=row.collect_cents,
            cash_denomination_cents=row.cash_denomination_cents,
            package_size=row.package_size,
            package_count=row.package_count,
            ready_at=row.ready_at,
            search_at=row.search_at,
            next_attempt_at=row.next_attempt_at,
            quoted_fee_cents=row.quoted_fee_cents,
            status="cancelled",
            assigned_driver_id=other_driver_id,
            tracking_token="histtok1",
            short_id="ZZZZ1",
            cancelled_at=datetime.now(UTC),
        )
        session.add(clone)
        session.flush()
        foreign_id = str(clone.id)
        session.commit()

    _as_rider()
    history = client.get("/api/v1/rider/me/history", headers=AUTH)
    assert history.status_code == 200, history.text
    ids = {row["id"] for row in history.json()["items"]}
    assert request_id in ids
    assert foreign_id not in ids
    assert history.json()["cancelled_count"] == 1
    assert history.json()["earnings_cents"] == 0
```

Import `_driver_payload` from `test_delivery_rider_offers`. Also add:

```python
@requires_db
def test_rider_history_earnings_ignore_cancelled_and_paginate(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    first = _accept_and_deliver(client, engine, restaurant_id)
    second = _accept_and_deliver(client, engine, restaurant_id)
    request_id, offer_id = _create_and_offer(client, engine, restaurant_id)
    _as_rider()
    assert client.post(f"/api/v1/rider/me/offers/{offer_id}/accept", headers=AUTH).status_code == 200
    _as_owner()
    assert client.post(
        f"/api/v1/restaurants/me/dispatch-requests/{request_id}/cancel",
        headers=AUTH,
    ).status_code == 200

    _as_rider()
    page = client.get("/api/v1/rider/me/history", params={"limit": 1}, headers=AUTH)
    assert page.status_code == 200, page.text
    body = page.json()
    assert body["has_more"] is True
    assert len(body["items"]) == 1
    assert body["total"] == 3
    assert body["delivered_count"] == 2
    assert body["cancelled_count"] == 1
    fees = []
    for rid in (first, second):
        row = next(item for item in client.get(
            "/api/v1/rider/me/history", params={"limit": 100}, headers=AUTH
        ).json()["items"] if item["id"] == rid)
        fees.append(row["quoted_fee_cents"])
    assert body["earnings_cents"] == sum(fees)


@requires_db
def test_rider_history_excludes_yesterday_when_asking_today(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id = _accept_and_deliver(client, engine, restaurant_id)
    yesterday = datetime.now(UTC) - timedelta(days=1)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        row = session.get(DeliveryDispatchRequest, uuid.UUID(request_id))
        assert row is not None
        row.updated_at = yesterday
        session.commit()

    _as_rider()
    from app.modules.delivery_dispatch.history import today_mexico

    today = today_mexico().isoformat()
    history = client.get(
        "/api/v1/rider/me/history",
        params={"start": today, "end": today},
        headers=AUTH,
    )
    assert history.status_code == 200
    assert history.json()["items"] == []
```

If `updated_at` is overwritten by ORM `onupdate`, set it via SQL:

```python
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE delivery_dispatch_requests SET updated_at = :ts WHERE id = :id"
            ),
            {"ts": yesterday, "id": request_id},
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/api/test_delivery_dispatch_history.py -v`

Expected: FAIL 404 on `/rider/me/history`.

- [ ] **Step 3: Implement query + endpoint**

Add to `schemas.py`:

```python
class RiderHistoryHoldDTO(BaseModel):
    request_id: uuid.UUID
    short_id: str
    restaurant_name: str
    amount_cents: int
    customer_name: str


class RiderHistoryItemDTO(BaseModel):
    id: uuid.UUID
    short_id: str
    status: str
    closed_at: datetime
    restaurant_name: str
    restaurant_address: str | None = None
    dropoff_address: str
    quoted_fee_cents: int
    payment_method: str
    collect_cents: int
    cash_denomination_cents: int | None = None
    package_count: int
    package_size: str
    customer_name: str | None = None
    customer_phone: str | None = None
    notes: str | None = None
    credit_hold_cents: int = 0


class RiderHistoryPageDTO(BaseModel):
    start: date
    end: date
    items: list[RiderHistoryItemDTO]
    total: int
    delivered_count: int
    cancelled_count: int
    earnings_cents: int
    has_more: bool
    credit_limit_cents: int
    credit_held_cents: int
    credit_available_cents: int
    active_holds: list[RiderHistoryHoldDTO] = Field(default_factory=list)
```

Need `from datetime import date` in schemas if missing.

Append to `history.py` the query. Closed-at expression:

```python
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.db.models.delivery import DeliveryCreditHold, DeliveryDispatchRequest, DeliveryDriver
from app.db.models.restaurant import Restaurant
```

```python
def closed_at_expr():
    return func.coalesce(
        DeliveryDispatchRequest.cancelled_at,
        DeliveryDispatchRequest.updated_at,
    )


def _clamp_limit(limit: int | None) -> int:
    value = DEFAULT_LIMIT if limit is None else limit
    if value < 1:
        value = 1
    return min(value, MAX_LIMIT)


def list_dispatch_history(
    session: Session,
    *,
    provider_id: uuid.UUID | None = None,
    driver_id: uuid.UUID | None = None,
    zone_id: uuid.UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    status: str | None = None,
    limit: int | None = None,
    offset: int = 0,
    include_provider_fields: bool = False,
) -> dict:
    ...
```

Filter:

```python
    start_d = start or today_mexico()
    end_d = end or start_d
    start_utc, end_utc = mexico_city_range(start_d, end_d)
    closed = closed_at_expr()
    statuses = HISTORY_STATUSES if status is None else {status}
    if status is not None and status not in HISTORY_STATUSES:
        raise ValidationError("Estado de historial no válido")

    filters = [
        DeliveryDispatchRequest.status.in_(tuple(statuses)),
        closed >= start_utc,
        closed < end_utc,
    ]
    if driver_id is not None:
        filters.append(DeliveryDispatchRequest.assigned_driver_id == driver_id)
    if provider_id is not None:
        filters.append(DeliveryDispatchRequest.delivery_provider_id == provider_id)
    if zone_id is not None:
        filters.append(DeliveryDispatchRequest.zone_id == zone_id)

    page_limit = _clamp_limit(limit)
    offset = max(0, offset)

    total = session.scalar(select(func.count()).select_from(DeliveryDispatchRequest).where(*filters)) or 0
    delivered_count = session.scalar(
        select(func.count()).select_from(DeliveryDispatchRequest).where(
            *filters,
            DeliveryDispatchRequest.status == "delivered",
        )
    ) or 0
    cancelled_count = total - delivered_count
    earnings = session.scalar(
        select(func.coalesce(func.sum(DeliveryDispatchRequest.quoted_fee_cents), 0)).where(
            *filters,
            DeliveryDispatchRequest.status == "delivered",
        )
    ) or 0
```

Wait: `delivered_count` with `*filters` already includes status filter. If caller asked `status=cancelled`, delivered_count must still be 0 and earnings 0. If filters already restrict to cancelled, adding `status == delivered` yields 0. Good.

If caller omitted status, filters include both; extra `status == delivered` for earnings is correct.

`cancelled_count = session.scalar(... status == cancelled)` is safer than `total - delivered_count` when status filter is delivered-only (cancelled_count should be 0, total==delivered_count). `total - delivered_count` still works.

Items query: join Restaurant, outerjoin hold, order `closed.desc(), created_at.desc()`, limit/offset.

For `include_provider_fields`, return extra keys used by `ProviderHistoryItemDTO` (Task 3). In Task 2, rider mapper ignores extras.

`RiderDispatchService.get_history`:

```python
    def get_history(
        self,
        user: UserDTO,
        *,
        start: date | None = None,
        end: date | None = None,
        status: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> RiderHistoryPageDTO:
        driver = self._require_driver(user)
        payload = list_dispatch_history(
            self._session,
            driver_id=driver.id,
            start=start,
            end=end,
            status=status,
            limit=limit,
            offset=offset,
            include_provider_fields=False,
        )
        available = max(0, driver.credit_limit_cents - driver.credit_held_cents)
        holds = ...  # status held for this driver, join restaurant name
        return RiderHistoryPageDTO(
            start=payload["start"],
            end=payload["end"],
            items=payload["items"],
            ...
            credit_limit_cents=driver.credit_limit_cents,
            credit_held_cents=driver.credit_held_cents,
            credit_available_cents=available,
            active_holds=holds,
        )
```

Active holds are **current** holds, not period-filtered.

`rider_api.py`:

```python
from datetime import date
from typing import Literal

from fastapi import Query

@rider_router.get("/me/history", response_model=RiderHistoryPageDTO)
def get_rider_history(
    user: UserDTO = Depends(get_synced_user),
    service: RiderDispatchService = Depends(_rider_service),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    status: Literal["delivered", "cancelled"] | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> RiderHistoryPageDTO:
    return service.get_history(
        user, start=start, end=end, status=status, limit=limit, offset=offset
    )
```

Do not add `driver_id`.

Confirm Restaurant import: in `service.py` it is `from app.db.models.restaurant import Restaurant` or `from app.db.models import Restaurant`. Copy the existing import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/api/test_delivery_dispatch_history.py tests/modules/test_dispatch_history_range.py -v`

Expected: PASS. If clone `DeliveryDispatchRequest` fails CHECKs (tracking_token unique, short_id unique), the test already uses unique values. If `assigned_driver_id` FK fails because `other_id` is not a driver, **do not** use a random UUID: create a second driver via `POST /delivery-providers/me/drivers` with a different email/plate (`_driver_payload(email="otro@empresa.com", plate="XYZ999")`) while `_as_mexy()`, then set `assigned_driver_id` to that driver’s id.

---

### Task 3: Dashboard history API

**Files:**
- Modify: `backend/tests/api/test_delivery_dispatch_history.py` (add tests)
- Modify: `backend/app/modules/delivery_dispatch/schemas.py` (`ProviderHistoryItemDTO`, `ProviderHistoryPageDTO`)
- Modify: `backend/app/modules/delivery_dispatch/history.py` (`include_provider_fields=True`)
- Modify: `backend/app/modules/delivery_dispatch/service.py` (`DeliveryDispatchService.list_dispatch_history`)
- Modify: `backend/app/modules/delivery_dispatch/api.py`

**Interfaces:**
- Consumes: `list_dispatch_history(..., provider_id=, driver_id=, zone_id=, include_provider_fields=True)`
- Produces: `GET /api/v1/delivery-providers/me/dispatch-history`

- [ ] **Step 1: Write failing tests**

```python
@requires_db
def test_provider_history_lists_company_rows_and_filters_driver(client, engine):
    restaurant_id, driver_id = _setup_ready_rider(client, engine)
    request_id = _accept_and_deliver(client, engine, restaurant_id)

    _as_mexy()
    listed = client.get("/api/v1/delivery-providers/me/dispatch-history", headers=AUTH)
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert [row["id"] for row in body["items"]] == [request_id]
    assert body["items"][0]["assigned_driver_id"] == driver_id
    assert body["items"][0]["assigned_driver_name"]
    assert body["items"][0]["zone_id"]
    assert "dropoff_lat" in body["items"][0]

    other = client.get(
        "/api/v1/delivery-providers/me/dispatch-history",
        params={"driver_id": str(uuid.uuid4())},
        headers=AUTH,
    )
    assert other.status_code == 200
    assert other.json()["items"] == []


@requires_db
def test_provider_history_zone_filter_and_non_member(client, engine):
    restaurant_id, _driver_id = _setup_ready_rider(client, engine)
    request_id = _accept_and_deliver(client, engine, restaurant_id)
    _as_mexy()
    full = client.get("/api/v1/delivery-providers/me/dispatch-history", headers=AUTH)
    zone_id = full.json()["items"][0]["zone_id"]
    filtered = client.get(
        "/api/v1/delivery-providers/me/dispatch-history",
        params={"zone_id": zone_id},
        headers=AUTH,
    )
    assert [row["id"] for row in filtered.json()["items"]] == [request_id]
    empty = client.get(
        "/api/v1/delivery-providers/me/dispatch-history",
        params={"zone_id": str(uuid.uuid4())},
        headers=AUTH,
    )
    assert empty.json()["items"] == []

    _as_owner()
    denied = client.get("/api/v1/delivery-providers/me/dispatch-history", headers=AUTH)
    assert denied.status_code in {403, 404}
```

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && python -m pytest tests/api/test_delivery_dispatch_history.py::test_provider_history_lists_company_rows_and_filters_driver -v`

Expected: FAIL 404.

- [ ] **Step 3: Implement**

`ProviderHistoryItemDTO` extends rider item with:

```python
class ProviderHistoryItemDTO(RiderHistoryItemDTO):
    assigned_driver_id: uuid.UUID | None = None
    assigned_driver_name: str | None = None
    zone_id: uuid.UUID | None = None
    zone_name: str | None = None
    restaurant_lat: float | None = None
    restaurant_lng: float | None = None
    dropoff_lat: float
    dropoff_lng: float
    dropoff_maps_url: str | None = None
    ready_at: datetime
    search_at: datetime
    created_at: datetime
    cancelled_at: datetime | None = None
    updated_at: datetime
    dispatch_group_id: uuid.UUID | None = None
    case_applied: str | None = None
    credit_hold_status: str | None = None
```

`dropoff_lat` on the child overrides optional parent — parent rider item does not include coords. Keep coords **only** on provider DTO; rider DTO stays as spec (no coords required).

`DeliveryDispatchService.list_history(self, user_id, **query)`: `provider_id = self._require_provider_id(user_id)` then `list_dispatch_history(..., provider_id=provider_id, include_provider_fields=True)`.

Join `DeliveryDriver` and `DeliveryProviderZone` for names. Reuse accepted-case lookup: copy the small `_accepted_cases` query from `RiderDispatchService` into `history.py` as `_accepted_cases(session, requests)` so both endpoints share it (extract function, call from history serialize). Do not import RiderDispatchService into history.py.

`api.py`:

```python
@router.get("/me/dispatch-history", response_model=ProviderHistoryPageDTO)
def list_dispatch_history_endpoint(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    status: Literal["delivered", "cancelled"] | None = Query(default=None),
    driver_id: UUID | None = Query(default=None),
    zone_id: UUID | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ProviderHistoryPageDTO:
    return service.list_history(
        user.id,
        start=start,
        end=end,
        status=status,
        driver_id=driver_id,
        zone_id=zone_id,
        limit=limit,
        offset=offset,
    )
```

- [ ] **Step 4: Run full history tests**

Run: `cd backend && python -m pytest tests/api/test_delivery_dispatch_history.py tests/modules/test_dispatch_history_range.py -v`

Expected: PASS

---

### Task 4: Flutter period helper and copy

**Files:**
- Create: `apps/rider/lib/history_period.dart`
- Create: `apps/rider/lib/history_copy.dart`
- Create: `apps/rider/test/history_period_test.dart`
- Create: `apps/rider/test/history_copy_test.dart`

**Interfaces:**
- Produces: `historyDateRange(...)`, `historyEmptyMessage`, `historyStatusLabel`

Treat `now` as a civil datetime in Mexico (device local). Tests inject `DateTime(2026, 8, 18)` (Tuesday).

- [ ] **Step 1: Write failing tests**

`apps/rider/test/history_period_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/history_period.dart';

void main() {
  final now = DateTime(2026, 8, 18, 15, 30); // Tuesday

  test('today range is that calendar day', () {
    final range = historyDateRange(HistoryPeriod.today, now: now);
    expect(range.start, DateTime(2026, 8, 18));
    expect(range.end, DateTime(2026, 8, 18));
  });

  test('week range is Monday through Sunday containing now', () {
    final range = historyDateRange(HistoryPeriod.week, now: now);
    expect(range.start, DateTime(2026, 8, 17));
    expect(range.end, DateTime(2026, 8, 23));
  });

  test('month range is first through last day of month', () {
    final range = historyDateRange(HistoryPeriod.month, now: now);
    expect(range.start, DateTime(2026, 8, 1));
    expect(range.end, DateTime(2026, 8, 31));
  });

  test('custom uses inclusive start and end dates', () {
    final range = historyDateRange(
      HistoryPeriod.custom,
      now: now,
      customStart: DateTime(2026, 8, 1),
      customEnd: DateTime(2026, 8, 10),
    );
    expect(range.start, DateTime(2026, 8, 1));
    expect(range.end, DateTime(2026, 8, 10));
  });
}
```

`apps/rider/test/history_copy_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/history_copy.dart';

void main() {
  test('empty period copy is rider-facing', () {
    expect(historyEmptyMessage, 'Aún no hay pedidos en este periodo.');
    expect(historyEmptyMessage.contains('API'), isFalse);
  });

  test('status badges are Spanish', () {
    expect(historyStatusLabel('delivered'), 'Entregado');
    expect(historyStatusLabel('cancelled'), 'Cancelado');
  });
}
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/rider && flutter test test/history_period_test.dart test/history_copy_test.dart`

Expected: FAIL missing library.

- [ ] **Step 3: Implement**

```dart
enum HistoryPeriod { today, week, month, custom }

class HistoryDateRange {
  const HistoryDateRange({required this.start, required this.end});
  final DateTime start;
  final DateTime end;
}

DateTime _dateOnly(DateTime value) => DateTime(value.year, value.month, value.day);

HistoryDateRange historyDateRange(
  HistoryPeriod period, {
  required DateTime now,
  DateTime? customStart,
  DateTime? customEnd,
}) {
  final day = _dateOnly(now);
  switch (period) {
    case HistoryPeriod.today:
      return HistoryDateRange(start: day, end: day);
    case HistoryPeriod.week:
      final monday = day.subtract(Duration(days: day.weekday - DateTime.monday));
      final sunday = monday.add(const Duration(days: 6));
      return HistoryDateRange(start: monday, end: sunday);
    case HistoryPeriod.month:
      final start = DateTime(day.year, day.month, 1);
      final end = DateTime(day.year, day.month + 1, 0);
      return HistoryDateRange(start: start, end: end);
    case HistoryPeriod.custom:
      return HistoryDateRange(
        start: _dateOnly(customStart ?? day),
        end: _dateOnly(customEnd ?? day),
      );
  }
}

String formatHistoryQueryDate(DateTime value) {
  final y = value.year.toString().padLeft(4, '0');
  final m = value.month.toString().padLeft(2, '0');
  final d = value.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}
```

```dart
const historyEmptyMessage = 'Aún no hay pedidos en este periodo.';

String historyStatusLabel(String status) {
  return switch (status) {
    'delivered' => 'Entregado',
    'cancelled' => 'Cancelado',
    _ => status,
  };
}
```

- [ ] **Step 4: Run tests to pass**

Run: `cd apps/rider && flutter test test/history_period_test.dart test/history_copy_test.dart`

Expected: PASS

---

### Task 5: Rider Account screen

**Files:**
- Modify: `apps/rider/lib/models.dart`
- Modify: `apps/rider/lib/api.dart`
- Create: `apps/rider/lib/screens/account_screen.dart`
- Modify: `apps/rider/lib/screens/home_screen.dart` (logout button → account)

**Interfaces:**
- Consumes: `RiderApi.getHistory`, `historyDateRange`, `historyEmptyMessage`
- Produces: `AccountScreen`

- [ ] **Step 1: Add models + API (no widget test required beyond copy already covered)**

`RiderHistoryItem` / `RiderHistoryPage` in `models.dart` mirroring JSON keys (`quoted_fee_cents`, `credit_available_cents`, `active_holds`).

`RiderApi.getHistory`:

```dart
  Future<RiderHistoryPage> getHistory({
    required String start,
    required String end,
    String? status,
    int limit = 50,
    int offset = 0,
  }) async {
    final response = await _send(
      () => _client.get(
        _uri('/rider/me/history').replace(
          queryParameters: {
            'start': start,
            'end': end,
            'limit': '$limit',
            'offset': '$offset',
            if (status != null) 'status': status,
          },
        ),
        headers: _headers(),
      ),
    );
    return RiderHistoryPage.fromJson(_decode(response) as Map<String, dynamic>);
  }
```

- [ ] **Step 2: AccountScreen**

New file `account_screen.dart`:

- `Scaffold` background `AppColors.background`
- AppBar: back, title `Cuenta`, elevation 0, surface white
- Header: `controller.profile` first+last name, online chip
- Three metric tiles from latest `RiderHistoryPage`: Ganancias (`earnings_cents`), Disponible (`credit_available_cents`), En hold (`credit_held_cents`)
- If `active_holds` not empty: list restaurant + `formatMoneyCents`
- Period chips: Hoy / Semana / Mes / Rango. Selected chip uses `AppColors.accent`. Rango: `showDateRangePicker` then set custom start/end
- `RefreshIndicator` + `ListView.builder` with `ValueKey(item.id)`
- Card: `#` via `formatShortId`, restaurant, one-line dropoff (`maxLines: 1, overflow: ellipsis`), local time from `closed_at`, fee, badge Entregado/Cancelado (`AppColors.success` / `textMuted`)
- Tap: `showModalBottomSheet` / next route with customer, `openPhoneCall`, payment, collect, notes, hold
- Empty: `historyEmptyMessage`
- Error: `friendlyErrorMessage` / existing `networkUnavailableMessage`
- Bottom: `TextButton` `Cerrar sesión` color `AppColors.danger` calling `onSignOut` (pop first if needed)
- Pagination: when last item built and `hasMore`, fetch next offset and append. Totals/earnings always from latest payload (replace summary; append items)

Load on init and whenever period changes. Use `DateTime.now()` as `now` for presets.

- [ ] **Step 3: Home map button**

In `home_screen.dart` replace logout `IconButton`:

```dart
_RoundIconButton(
  icon: Icons.person_rounded,
  tooltip: 'Cuenta',
  size: 52,
  onPressed: () {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => AccountScreen(
          controller: widget.controller,
          onSignOut: widget.onSignOut,
        ),
      ),
    );
  },
),
```

Keep `_CreditChip` on the map (already there). Do not put logout on the map.

- [ ] **Step 4: Run Flutter tests**

Run: `cd apps/rider && flutter test`

Expected: PASS existing tests + history tests.

---

### Task 6: Delivery dashboard Historial

**Files:**
- Modify: `delivery-dashboard/src/lib/dispatch/monitorCopy.ts` (`delivered: 'Entregado'`, `cancelled: 'Cancelado'`)
- Modify: `delivery-dashboard/src/lib/api/types.ts`
- Modify: `delivery-dashboard/src/lib/api/deliveryProviders.ts`
- Modify: `delivery-dashboard/src/components/ui/Sidebar.tsx`
- Create: `delivery-dashboard/src/app/(panel)/historial/page.tsx`
- Create: `delivery-dashboard/src/components/pages/HistoryPage.tsx`
- Create: `delivery-dashboard/src/components/pages/HistoryPage.module.css`
- Create: `delivery-dashboard/src/components/history/HistoryDetailDrawer.tsx`

**Interfaces:**
- Consumes: `GET /delivery-providers/me/dispatch-history`
- Produces: `/historial` page

- [ ] **Step 1: Labels + client**

Add to `requestStatusLabel`:

```ts
delivered: 'Entregado',
cancelled: 'Cancelado',
```

Types:

```ts
export type DispatchHistoryItem = {
  id: string;
  short_id: string;
  status: 'delivered' | 'cancelled' | string;
  closed_at: string;
  restaurant_name: string;
  restaurant_address?: string | null;
  dropoff_address: string;
  quoted_fee_cents: number;
  payment_method: string;
  collect_cents: number;
  cash_denomination_cents?: number | null;
  package_count: number;
  package_size: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
  credit_hold_cents: number;
  credit_hold_status?: string | null;
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
  zone_id: string | null;
  zone_name: string | null;
  restaurant_lat: number | null;
  restaurant_lng: number | null;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_maps_url?: string | null;
  ready_at: string;
  search_at: string;
  created_at: string;
  cancelled_at?: string | null;
  updated_at: string;
  dispatch_group_id?: string | null;
  case_applied?: string | null;
};

export type DispatchHistoryPage = {
  start: string;
  end: string;
  items: DispatchHistoryItem[];
  total: number;
  delivered_count: number;
  cancelled_count: number;
  earnings_cents: number;
  has_more: boolean;
};
```

Client (mirror monitor zone query). Reuse period math: copy the same calendar rules in `delivery-dashboard/src/lib/dispatch/historyPeriod.ts` (today/week/month as civil dates, format `YYYY-MM-DD`). Do not import Flutter.

```ts
export function getMyDispatchHistory(
  token: string,
  params: {
    start: string;
    end: string;
    status?: 'delivered' | 'cancelled';
    driverId?: string | null;
    zoneId?: string | null;
    limit?: number;
    offset?: number;
  },
) {
  const qs = new URLSearchParams();
  qs.set('start', params.start);
  qs.set('end', params.end);
  if (params.status) qs.set('status', params.status);
  if (params.driverId) qs.set('driver_id', params.driverId);
  if (params.zoneId) qs.set('zone_id', params.zoneId);
  qs.set('limit', String(params.limit ?? 50));
  qs.set('offset', String(params.offset ?? 0));
  return apiRequest<DispatchHistoryPage>(
    `/delivery-providers/me/dispatch-history?${qs.toString()}`,
    { token },
  );
}
```

When `isAllZones`, omit `zoneId` (same as monitor).

- [ ] **Step 2: Sidebar + route**

Insert immediately after Monitor:

```tsx
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';

{ label: 'Monitor', path: '/monitor', icon: <QueryStatsOutlinedIcon fontSize="small" /> },
{ label: 'Historial', path: '/historial', icon: <HistoryOutlinedIcon fontSize="small" /> },
```

`src/app/(panel)/historial/page.tsx`:

```tsx
import HistoryPage from '@/components/pages/HistoryPage';

export default function Page() {
  return <HistoryPage />;
}
```

Do not use `/orders`.

- [ ] **Step 3: HistoryPage UI**

`PanelPageShell` title `Historial`, subtitle `Pedidos entregados y cancelados`.

Filters row: period chips (Hoy / Semana / Mes / Rango) styled like Partnerships `.tabs` / `.tab`. Rango: two `<input type="date">` + Aplicar. `FormSelect` driver: option `{ value: '', label: 'Todos' }` plus `listMyDeliveryDrivers`. Status select: Todos / Entregados / Cancelados.

Load with `useAuth` token + `useDeliveryZone().effectiveZoneId`. Soft loading: `opacity: 0.55` on the table, no full-page spinner after first load.

Desktop: table, `cursor: pointer`, hover border/background 180ms, no scale. Columns: cierre, `#`, estado, restaurante, cliente, dropoff, repartidor, zona, pago, cobro, tarifa, paquetes. Format money with `formatMoney`. Status via `requestStatusLabel`. Short id via `formatShortId`.

Mobile (`max-width: 768px`): cards with the same fields.

Empty: `No hay pedidos cerrados en este periodo.`

`has_more`: button `Cargar más` appends items, keeps summary from latest response (`total`, counts).

Row click opens `HistoryDetailDrawer` (RightDrawer). Rows: phone (`DriverPhoneContact` or tel link), coords + maps (`mapsSearchUrl` / `dropoff_maps_url`), cash denomination via `requestCashDenominationLine` if you can pass a compatible shape, notes, `caseLabel`, group id, hold, timestamps (`created_at`, `ready_at`, `cancelled_at`, `updated_at`, `closed_at`). No live search blockers.

CSS: reuse Partnerships header/empty; table in `HistoryPage.module.css`; `cursor: pointer` on rows; focus-visible outline; `@media (prefers-reduced-motion: reduce)` disable transitions.

- [ ] **Step 4: Typecheck**

Run: `cd delivery-dashboard && npx tsc --noEmit`

Expected: PASS. Fix any type errors. No new dashboard E2E required (spec).

---

## Self-review

| Spec section | Task |
|--------------|------|
| Rider GET history + earnings + credit + holds | 2 |
| Dashboard GET history + driver/zone | 3 |
| Mexico City dates | 1, 4, 6 |
| Account screen, logout moved | 5 |
| Sidebar Historial, table/drawer | 6 |
| Flutter period + empty/badge tests | 4 |
| `/rider/me` unchanged | 2 (assert assignments empty after deliver) |
| No `driver_id` on rider route | 2 (endpoint signature) |

Type names: `list_dispatch_history` (python fn) vs FastAPI handler `list_dispatch_history_endpoint` vs service method `list_history` on provider and `get_history` on rider. `Restaurant` import is `from app.db.models.restaurant import Restaurant`.

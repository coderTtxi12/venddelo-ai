# Public tracking via Supabase Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public `/rastreo/{token}` page stays live through Supabase Broadcast from Postgres, without a Cloud Run WebSocket, and only while the tab is visible and the delivery is not finished.

**Architecture:** Alembic adds SQL helpers + triggers that `realtime.send` to topic `tracking:{token}`. The frontend GET snapshot stays on the FastAPI public endpoint. A new hook subscribes with the anon key when the tab is visible; `updated` refetches GET, `location` patches GPS. The backend tracking hub and public tracking WebSocket are deleted.

**Tech Stack:** Postgres/Alembic, FastAPI, Next.js 16, `@supabase/supabase-js` Broadcast, pytest, `node --import tsx --test`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-20-public-tracking-supabase-realtime-design.es.md`
- Snapshot stays `GET /api/v1/public/dispatch-tracking/{token}`. Do not expose `delivery_*` to anon RLS.
- Broadcast only: no `postgres_changes` on domain tables.
- Topic `tracking:{token}`, events `updated` and `location`, `private = false`.
- Subscribe only if tab visible and status ∉ `{delivered, cancelled}`.
- GPS `UPDATE` must succeed even when `realtime.send` is missing (local Docker).
- Do not change monitor / rider / kitchen hubs.
- No new UI palette, copy of statuses, or map.
- TDD: failing test first; watch it fail; then implement.
- Pytest: `cd backend && .venv/bin/python -m pytest <path> -v --tb=short`
- Frontend tests: `cd frontend && node --import tsx --test <path>`
- Do not commit unless the user asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/migrations/versions/0063_public_tracking_realtime.py` | SQL functions + triggers |
| `backend/tests/modules/test_tracking_realtime_sql.py` | ETA, no-op send, trigger emit via stub `realtime.send` |
| `backend/app/modules/delivery_dispatch/tracking_view.py` | Keep DTO builders; delete hub emits |
| `backend/app/modules/delivery_dispatch/monitor_notify.py` | Stop calling tracking emits |
| `backend/app/modules/delivery_dispatch/ws.py` | Delete public tracking WS |
| `backend/app/infra/realtime/tracking_hub.py` | Delete file |
| `backend/app/main.py` | Unbind tracking hub |
| `backend/tests/modules/test_tracking_realtime_hub.py` | Delete file |
| `backend/tests/api/test_restaurant_dispatch_requests.py` | Delete WS test |
| `frontend/src/lib/dispatch/publicTrackingRealtime.ts` | Pure subscribe/patch helpers |
| `frontend/src/lib/dispatch/publicTrackingRealtime.test.ts` | node:test for helpers |
| `frontend/src/lib/dispatch/usePublicTrackingRealtime.ts` | Supabase channel + visibility + poll |
| `frontend/src/components/delivery/PublicTracking.tsx` | Wire the new hook |
| `frontend/src/lib/dispatch/usePublicTrackingSocket.ts` | Delete file |

---

### Task 1: SQL ETA + no-op send helper

**Files:**
- Create: `backend/migrations/versions/0063_public_tracking_realtime.py`
- Create: `backend/tests/modules/test_tracking_realtime_sql.py`

**Interfaces:**
- Produces:
  - `public.tracking_eta_seconds(p_status text, p_rider_lat float8, p_rider_lng float8, p_pickup_lat float8, p_pickup_lng float8, p_dropoff_lat float8, p_dropoff_lng float8) RETURNS integer`
  - `public.tracking_realtime_send(p_topic text, p_event text, p_payload jsonb) RETURNS void`
- Consumes: Python `tracking_eta_seconds` / `geodesic_meters` in `backend/app/modules/delivery_dispatch/tracking_view.py` and `geo.py` (radius `6371000`, speed `8` m/s, `round`).

- [ ] **Step 1: Write the failing test**

```python
"""SQL helpers for public tracking broadcast."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.modules.delivery_dispatch.tracking_view import tracking_eta_seconds
from tests.conftest import requires_db

STATUS = "in_transit"
RIDER = (19.4326, -99.1332)
DROPOFF = (19.44, -99.14)


@requires_db
def test_tracking_eta_seconds_sql_matches_python(engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        sql_value = session.execute(
            text(
                """
                SELECT public.tracking_eta_seconds(
                    :status, :rlat, :rlng, NULL, NULL, :dlat, :dlng
                )
                """
            ),
            {
                "status": STATUS,
                "rlat": RIDER[0],
                "rlng": RIDER[1],
                "dlat": DROPOFF[0],
                "dlng": DROPOFF[1],
            },
        ).scalar_one()
    python_value = tracking_eta_seconds(
        STATUS,
        rider_lat=RIDER[0],
        rider_lng=RIDER[1],
        pickup_lat=None,
        pickup_lng=None,
        dropoff_lat=DROPOFF[0],
        dropoff_lng=DROPOFF[1],
    )
    assert sql_value == python_value


@requires_db
def test_tracking_realtime_send_is_noop_without_realtime(engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        session.execute(
            text(
                "SELECT public.tracking_realtime_send('tracking:abc', 'updated', '{}'::jsonb)"
            )
        )
        session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_tracking_realtime_sql.py -v --tb=short`

Expected: FAIL with `function public.tracking_eta_seconds does not exist` (or skip if Postgres is down).

- [ ] **Step 3: Write the migration (functions only; triggers in Task 2)**

Create `backend/migrations/versions/0063_public_tracking_realtime.py`:

```python
"""public tracking supabase realtime broadcast helpers

Revision ID: 0063_public_tracking_realtime
Revises: 0062_case_d_pickup_1000m
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0063_public_tracking_realtime"
down_revision: str | None = "0062_case_d_pickup_1000m"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.tracking_eta_seconds(
            p_status text,
            p_rider_lat double precision,
            p_rider_lng double precision,
            p_pickup_lat double precision,
            p_pickup_lng double precision,
            p_dropoff_lat double precision,
            p_dropoff_lng double precision
        ) RETURNS integer
        LANGUAGE plpgsql
        IMMUTABLE
        AS $$
        DECLARE
            dest_lat double precision;
            dest_lng double precision;
            d_phi double precision;
            d_lambda double precision;
            a double precision;
            meters double precision;
        BEGIN
            IF p_rider_lat IS NULL OR p_rider_lng IS NULL THEN
                RETURN NULL;
            END IF;
            IF p_status = 'assigned' THEN
                IF p_pickup_lat IS NULL OR p_pickup_lng IS NULL THEN
                    RETURN NULL;
                END IF;
                dest_lat := p_pickup_lat;
                dest_lng := p_pickup_lng;
            ELSIF p_status IN ('picked_up', 'in_transit') THEN
                dest_lat := p_dropoff_lat;
                dest_lng := p_dropoff_lng;
            ELSE
                RETURN NULL;
            END IF;
            d_phi := radians(dest_lat - p_rider_lat);
            d_lambda := radians(dest_lng - p_rider_lng);
            a := sin(d_phi / 2) ^ 2
                + cos(radians(p_rider_lat)) * cos(radians(dest_lat))
                * sin(d_lambda / 2) ^ 2;
            meters := 6371000 * 2 * atan2(sqrt(a), sqrt(1 - a));
            RETURN round(meters / 8.0)::integer;
        END;
        $$;

        CREATE OR REPLACE FUNCTION public.tracking_realtime_send(
            p_topic text,
            p_event text,
            p_payload jsonb
        ) RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        BEGIN
            IF to_regprocedure('realtime.send(jsonb, text, text, boolean)') IS NULL THEN
                RETURN;
            END IF;
            PERFORM realtime.send(p_payload, p_event, p_topic, false);
        END;
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.tracking_realtime_send(text, text, jsonb)")
    op.execute(
        """
        DROP FUNCTION IF EXISTS public.tracking_eta_seconds(
            text, double precision, double precision, double precision,
            double precision, double precision, double precision
        )
        """
    )
```

If tests use `Base.metadata.create_all` instead of Alembic, also execute the same SQL in the test module `setup_module` / a fixture so pytest sees the functions. Prefer running against the migrated test DB (existing `requires_db` engine already has Alembic applied in this repo). If CI applies migrations on the test DB, running the test after `alembic upgrade head` is enough. If a test session is created from metadata only, add:

```python
@pytest.fixture(autouse=True)
def _install_tracking_sql(engine):
    with engine.begin() as conn:
        conn.execute(text(<same CREATE OR REPLACE bodies as upgrade>))
    yield
```

inside `test_tracking_realtime_sql.py` so Task 1 is not blocked on how this environment applies Alembic.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_tracking_realtime_sql.py -v --tb=short`

Expected: PASS (2 tests). Send no-op must not raise.

---

### Task 2: Triggers that broadcast `updated` and `location`

**Files:**
- Modify: `backend/migrations/versions/0063_public_tracking_realtime.py` (append trigger functions)
- Modify: `backend/tests/modules/test_tracking_realtime_sql.py`

**Interfaces:**
- Produces:
  - Trigger `delivery_dispatch_requests_tracking_updated` on `AFTER INSERT OR UPDATE OF status, assigned_driver_id, customer_name, dropoff_lat, dropoff_lng, dropoff_address, payment_method, collect_cents, cash_denomination_cents, package_count, cancelled_at, picked_up_at, in_transit_at, delivered_at`
  - Trigger `delivery_drivers_tracking_location` on `AFTER UPDATE OF last_lat, last_lng`
- Consumes: `public.tracking_realtime_send`, `public.tracking_eta_seconds`

- [ ] **Step 1: Write the failing tests**

Append to `test_tracking_realtime_sql.py`:

```python
@requires_db
def test_request_status_update_broadcasts_updated(engine, client):
    from tests.api.test_restaurant_dispatch_requests import (
        _activate_partnership,
        _create_restaurant,
        _dispatch_payload,
    )
    from tests.api.test_delivery_partnerships import _create_mexy_provider
    from tests.api.test_api_v1 import AUTH

    _install_realtime_stub(engine)
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="track-sql-upd")
    _activate_partnership(client, engine, restaurant_id)
    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    token = created.json()["tracking_token"]
    request_id = created.json()["id"]

    _clear_realtime_log(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        session.execute(
            text(
                "UPDATE delivery_dispatch_requests SET status = 'searching' WHERE id = CAST(:id AS uuid)"
            ),
            {"id": request_id},
        )
        session.commit()

    rows = _realtime_log(engine)
    assert any(
        row["topic"] == f"tracking:{token}" and row["event"] == "updated" for row in rows
    )


@requires_db
def test_next_attempt_update_does_not_broadcast(engine, client):
    from datetime import UTC, datetime, timedelta

    from tests.api.test_restaurant_dispatch_requests import (
        _activate_partnership,
        _create_restaurant,
        _dispatch_payload,
    )
    from tests.api.test_delivery_partnerships import _create_mexy_provider
    from tests.api.test_api_v1 import AUTH

    _install_realtime_stub(engine)
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="track-sql-skip")
    _activate_partnership(client, engine, restaurant_id)
    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    _clear_realtime_log(engine)
    later = (datetime.now(UTC) + timedelta(minutes=5)).isoformat()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE delivery_dispatch_requests
                SET next_attempt_at = CAST(:ts AS timestamptz)
                WHERE id = CAST(:id AS uuid)
                """
            ),
            {"ts": later, "id": created.json()["id"]},
        )
    assert _realtime_log(engine) == []


@requires_db
def test_driver_gps_broadcasts_location_only_for_live_requests(engine, client):
    from tests.api.test_restaurant_dispatch_requests import (
        _activate_partnership,
        _create_restaurant,
        _dispatch_payload,
    )
    from tests.api.test_delivery_partnerships import _create_mexy_provider
    from tests.api.test_api_v1 import AUTH

    _install_realtime_stub(engine)
    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="track-sql-gps")
    _activate_partnership(client, engine, restaurant_id)
    created = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    token = created.json()["tracking_token"]
    request_id = created.json()["id"]

    with engine.begin() as conn:
        driver_id = conn.execute(
            text(
                """
                INSERT INTO delivery_drivers (
                    delivery_provider_id, email, first_name, last_name, phone,
                    profile_photo_path, ine_document_path, license_document_path,
                    insurance_document_path, plate, motorcycle_brand, motorcycle_color,
                    status, is_online
                )
                SELECT delivery_provider_id, 'gps-rider@example.com', 'Ana', 'R', '5511111111',
                       'p', 'i', 'l', 's', 'ABC123', 'Honda', 'rojo',
                       'active', true
                FROM delivery_dispatch_requests
                WHERE id = CAST(:id AS uuid)
                RETURNING id
                """
            ),
            {"id": request_id},
        ).scalar_one()
        conn.execute(
            text(
                """
                UPDATE delivery_dispatch_requests
                SET status = 'in_transit', assigned_driver_id = :did
                WHERE id = CAST(:id AS uuid)
                """
            ),
            {"did": driver_id, "id": request_id},
        )

    _clear_realtime_log(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE delivery_drivers
                SET last_lat = 19.4326, last_lng = -99.1332
                WHERE id = :did
                """
            ),
            {"did": driver_id},
        )
    live_rows = [
        row
        for row in _realtime_log(engine)
        if row["event"] == "location" and row["topic"] == f"tracking:{token}"
    ]
    assert live_rows
    payload = live_rows[0]["payload"]
    assert payload["latitude"] == 19.4326
    assert payload["longitude"] == -99.1332
    assert payload["eta_seconds"] is not None

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE delivery_dispatch_requests
                SET status = 'delivered'
                WHERE id = CAST(:id AS uuid)
                """
            ),
            {"id": request_id},
        )
    _clear_realtime_log(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE delivery_drivers
                SET last_lat = 19.45, last_lng = -99.15
                WHERE id = :did
                """
            ),
            {"did": driver_id},
        )
    assert [
        row for row in _realtime_log(engine) if row["event"] == "location"
    ] == []
```

Add helpers in the same file (not placeholders — include them):

```python
def _install_realtime_stub(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS realtime"))
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS realtime.send_log (
                    id bigserial PRIMARY KEY,
                    payload jsonb NOT NULL,
                    event text NOT NULL,
                    topic text NOT NULL,
                    is_private boolean NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE OR REPLACE FUNCTION realtime.send(
                    payload jsonb,
                    event text,
                    topic text,
                    is_private boolean
                ) RETURNS void
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    INSERT INTO realtime.send_log (payload, event, topic, is_private)
                    VALUES (payload, event, topic, is_private);
                END;
                $$
                """
            )
        )


def _clear_realtime_log(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE realtime.send_log"))


def _realtime_log(engine) -> list[dict]:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        rows = session.execute(
            text("SELECT payload, event, topic FROM realtime.send_log ORDER BY id")
        ).mappings()
        return [dict(row) for row in rows]
```

If `INSERT INTO delivery_drivers` fails CHECKs (required columns from later migrations: emergency contact, registered zone, etc.), **do not invent values**. Open `backend/app/db/models/delivery.py` class `DeliveryDriver` and copy every NOT NULL column into the INSERT. Prefer creating the driver via `POST /delivery-providers/me/drivers` like `backend/tests/api/test_delivery_rider_offers.py` if that helper already exists in this branch.

These tests share `client` + `engine`. If they collide with `test_restaurant_dispatch_requests._clean_dispatch_tables`, put the three tests in `backend/tests/api/test_public_tracking_realtime_sql.py` instead and reuse that file’s TRUNCATE fixture by importing `_clean_dispatch_tables` pattern (copy the autouse TRUNCATE from `test_restaurant_dispatch_requests.py`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_tracking_realtime_sql.py -v --tb=short`

Expected: FAIL — status UPDATE does not write `realtime.send_log` yet.

- [ ] **Step 3: Add trigger functions to the same migration `upgrade()`**

Append after the helper functions:

```sql
CREATE OR REPLACE FUNCTION public.delivery_dispatch_requests_tracking_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.tracking_realtime_send(
        'tracking:' || NEW.tracking_token,
        'updated',
        '{}'::jsonb
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_dispatch_requests_tracking_updated
    ON public.delivery_dispatch_requests;
CREATE TRIGGER delivery_dispatch_requests_tracking_updated
AFTER INSERT OR UPDATE OF
    status,
    assigned_driver_id,
    customer_name,
    dropoff_lat,
    dropoff_lng,
    dropoff_address,
    payment_method,
    collect_cents,
    cash_denomination_cents,
    package_count,
    cancelled_at,
    picked_up_at,
    in_transit_at,
    delivered_at
ON public.delivery_dispatch_requests
FOR EACH ROW
EXECUTE FUNCTION public.delivery_dispatch_requests_tracking_updated();

CREATE OR REPLACE FUNCTION public.delivery_drivers_tracking_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    rec record;
    pickup_lat double precision;
    pickup_lng double precision;
    eta integer;
BEGIN
    IF NEW.last_lat IS NULL OR NEW.last_lng IS NULL THEN
        RETURN NEW;
    END IF;
    FOR rec IN
        SELECT r.tracking_token, r.status, r.dropoff_lat, r.dropoff_lng, r.restaurant_id
        FROM public.delivery_dispatch_requests r
        WHERE r.assigned_driver_id = NEW.id
          AND r.status IN ('assigned', 'picked_up', 'in_transit')
    LOOP
        SELECT rest.latitude, rest.longitude
          INTO pickup_lat, pickup_lng
        FROM public.restaurants rest
        WHERE rest.id = rec.restaurant_id;
        eta := public.tracking_eta_seconds(
            rec.status,
            NEW.last_lat,
            NEW.last_lng,
            pickup_lat,
            pickup_lng,
            rec.dropoff_lat,
            rec.dropoff_lng
        );
        PERFORM public.tracking_realtime_send(
            'tracking:' || rec.tracking_token,
            'location',
            jsonb_build_object(
                'latitude', NEW.last_lat,
                'longitude', NEW.last_lng,
                'eta_seconds', eta
            )
        );
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_drivers_tracking_location
    ON public.delivery_drivers;
CREATE TRIGGER delivery_drivers_tracking_location
AFTER UPDATE OF last_lat, last_lng
ON public.delivery_drivers
FOR EACH ROW
EXECUTE FUNCTION public.delivery_drivers_tracking_location();
```

`downgrade()` must drop triggers then functions (location, updated, then Task 1 functions).

If this Postgres is older than PG14, replace `EXECUTE FUNCTION` with `EXECUTE PROCEDURE`.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_tracking_realtime_sql.py tests/api/test_public_tracking_realtime_sql.py -v --tb=short`

Expected: PASS. Also run `tests/api/test_restaurant_dispatch_requests.py::test_public_tracking_ws_sends_snapshot` still passes until Task 5 deletes it.

---

### Task 3: Frontend pure helpers

**Files:**
- Create: `frontend/src/lib/dispatch/publicTrackingRealtime.ts`
- Create: `frontend/src/lib/dispatch/publicTrackingRealtime.test.ts`

**Interfaces:**
- Produces:
  - `TERMINAL_TRACKING_STATUSES: ReadonlySet<DispatchStatus>` = `delivered`, `cancelled`
  - `trackingBroadcastTopic(token: string): string` → ``tracking:${token}``
  - `shouldConsumeTrackingRealtime(input: { status: DispatchStatus | null; visibilityState: DocumentVisibilityState }): boolean`
  - `applyTrackingLocation(current: PublicDispatchTracking, event: TrackingLocationPayload): PublicDispatchTracking`
  - `TrackingLocationPayload = { latitude: number; longitude: number; eta_seconds: number | null }`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import type { PublicDispatchTracking } from '@/lib/api/dispatch';
import {
  applyTrackingLocation,
  shouldConsumeTrackingRealtime,
  trackingBroadcastTopic,
} from './publicTrackingRealtime.ts';

function snapshot(overrides: Partial<PublicDispatchTracking> = {}): PublicDispatchTracking {
  return {
    status: 'assigned',
    short_id: 'ABC12',
    restaurant_name: 'Bistro',
    customer_name: 'María',
    pickup: { latitude: 19.43, longitude: -99.13, name: 'Bistro' },
    dropoff: { latitude: 19.44, longitude: -99.14, address: 'Centro' },
    rider: {
      first_name: 'Ana',
      photo_url: null,
      plate_suffix: '123',
      vehicle_type: 'moto',
      motorcycle_brand: 'Honda',
      motorcycle_color: 'rojo',
      latitude: 19.43,
      longitude: -99.13,
      phone: '5511111111',
    },
    eta_seconds: 100,
    package_count: 1,
    payment_method: 'cash',
    collect_cents: 25000,
    cash_denomination_cents: 50000,
    ...overrides,
  };
}

test('topic uses tracking token', () => {
  assert.equal(trackingBroadcastTopic('abc'), 'tracking:abc');
});

test('consumes realtime only when visible and in progress', () => {
  assert.equal(
    shouldConsumeTrackingRealtime({ status: 'assigned', visibilityState: 'visible' }),
    true,
  );
  assert.equal(
    shouldConsumeTrackingRealtime({ status: 'assigned', visibilityState: 'hidden' }),
    false,
  );
  assert.equal(
    shouldConsumeTrackingRealtime({ status: 'delivered', visibilityState: 'visible' }),
    false,
  );
  assert.equal(
    shouldConsumeTrackingRealtime({ status: 'cancelled', visibilityState: 'visible' }),
    false,
  );
  assert.equal(
    shouldConsumeTrackingRealtime({ status: null, visibilityState: 'visible' }),
    false,
  );
});

test('location event patches rider coords and ignores missing rider', () => {
  const next = applyTrackingLocation(snapshot(), {
    latitude: 19.5,
    longitude: -99.2,
    eta_seconds: 42,
  });
  assert.equal(next.rider?.latitude, 19.5);
  assert.equal(next.rider?.longitude, -99.2);
  assert.equal(next.eta_seconds, 42);

  const noRider = applyTrackingLocation(snapshot({ rider: null }), {
    latitude: 19.5,
    longitude: -99.2,
    eta_seconds: 42,
  });
  assert.equal(noRider.rider, null);
  assert.equal(noRider.eta_seconds, 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --import tsx --test src/lib/dispatch/publicTrackingRealtime.test.ts`

Expected: FAIL `Cannot find module './publicTrackingRealtime.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
import type { DispatchStatus, PublicDispatchTracking } from '@/lib/api/dispatch';

export const TERMINAL_TRACKING_STATUSES: ReadonlySet<DispatchStatus> = new Set([
  'delivered',
  'cancelled',
]);

export type TrackingLocationPayload = {
  latitude: number;
  longitude: number;
  eta_seconds: number | null;
};

export function trackingBroadcastTopic(token: string): string {
  return `tracking:${token}`;
}

export function shouldConsumeTrackingRealtime(input: {
  status: DispatchStatus | null;
  visibilityState: DocumentVisibilityState;
}): boolean {
  if (input.status == null) return false;
  if (input.visibilityState !== 'visible') return false;
  return !TERMINAL_TRACKING_STATUSES.has(input.status);
}

export function applyTrackingLocation(
  current: PublicDispatchTracking,
  event: TrackingLocationPayload,
): PublicDispatchTracking {
  if (!current.rider) return current;
  return {
    ...current,
    eta_seconds: event.eta_seconds,
    rider: {
      ...current.rider,
      latitude: event.latitude,
      longitude: event.longitude,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --import tsx --test src/lib/dispatch/publicTrackingRealtime.test.ts`

Expected: PASS

---

### Task 4: Hook + page wiring

**Files:**
- Create: `frontend/src/lib/dispatch/usePublicTrackingRealtime.ts`
- Modify: `frontend/src/components/delivery/PublicTracking.tsx`
- Delete after wiring: `frontend/src/lib/dispatch/usePublicTrackingSocket.ts`

**Interfaces:**
- Consumes: `shouldConsumeTrackingRealtime`, `trackingBroadcastTopic`, `applyTrackingLocation`, `createClient()` from `frontend/src/lib/supabase/client.ts`
- Produces: `usePublicTrackingRealtime(token, status, options)` with the same status union `connecting | live | reconnecting | offline`

- [ ] **Step 1: Implement the hook**

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import type { DispatchStatus } from '@/lib/api/dispatch';
import { createClient } from '@/lib/supabase/client';
import {
  shouldConsumeTrackingRealtime,
  trackingBroadcastTopic,
  type TrackingLocationPayload,
} from './publicTrackingRealtime';

export type PublicTrackingRealtimeEvent =
  | { type: 'tracking.updated' }
  | ({ type: 'tracking.location' } & TrackingLocationPayload);

export type PublicTrackingRealtimeStatus =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'offline';

type Options = {
  onEvent: (event: PublicTrackingRealtimeEvent) => void;
  onStatusChange?: (status: PublicTrackingRealtimeStatus) => void;
  onReconnect?: () => void;
};

export function usePublicTrackingRealtime(
  token: string | null,
  status: DispatchStatus | null,
  options: Options,
) {
  const onEventRef = useRef(options.onEvent);
  const onStatusChangeRef = useRef(options.onStatusChange);
  const onReconnectRef = useRef(options.onReconnect);
  const [visibilityState, setVisibilityState] = useState<DocumentVisibilityState>(() =>
    typeof document === 'undefined' ? 'visible' : document.visibilityState,
  );

  useEffect(() => {
    onEventRef.current = options.onEvent;
    onStatusChangeRef.current = options.onStatusChange;
    onReconnectRef.current = options.onReconnect;
  });

  useEffect(() => {
    const onVisibility = () => setVisibilityState(document.visibilityState);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const consume = shouldConsumeTrackingRealtime({ status, visibilityState });

  useEffect(() => {
    if (!token || !consume) {
      onStatusChangeRef.current?.('offline');
      return;
    }

    const supabase = createClient();
    let cancelled = false;
    let hasConnectedOnce = false;
    onStatusChangeRef.current?.('connecting');

    const channel = supabase.channel(trackingBroadcastTopic(token), {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'updated' }, () => {
        onEventRef.current({ type: 'tracking.updated' });
      })
      .on('broadcast', { event: 'location' }, ({ payload }) => {
        const body = payload as TrackingLocationPayload;
        if (typeof body?.latitude !== 'number' || typeof body?.longitude !== 'number') {
          return;
        }
        onEventRef.current({
          type: 'tracking.location',
          latitude: body.latitude,
          longitude: body.longitude,
          eta_seconds: typeof body.eta_seconds === 'number' ? body.eta_seconds : null,
        });
      })
      .subscribe((channelStatus) => {
        if (cancelled) return;
        if (channelStatus === 'SUBSCRIBED') {
          if (hasConnectedOnce) onReconnectRef.current?.();
          hasConnectedOnce = true;
          onStatusChangeRef.current?.('live');
          return;
        }
        if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
          onStatusChangeRef.current?.(hasConnectedOnce ? 'reconnecting' : 'offline');
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      onStatusChangeRef.current?.('offline');
    };
  }, [token, consume]);
}
```

- [ ] **Step 2: Wire `PublicTracking.tsx`**

Replace the `usePublicTrackingSocket` import with `usePublicTrackingRealtime` + `applyTrackingLocation`.

Keep the initial `refresh` GET. Pass `tracking?.status ?? null` into the hook.

```tsx
  const [socketStatus, setSocketStatus] = useState<PublicTrackingRealtimeStatus>('connecting');

  usePublicTrackingRealtime(token, tracking?.status ?? null, {
    onStatusChange: setSocketStatus,
    onReconnect: () => {
      void refresh();
    },
    onEvent: (event) => {
      if (event.type === 'tracking.updated') {
        void refresh();
        return;
      }
      setTracking((current) =>
        current ? applyTrackingLocation(current, event) : current,
      );
    },
  });

  const liveStatus = tracking?.status ?? null;
  const showLive =
    liveStatus != null && liveStatus !== 'delivered' && liveStatus !== 'cancelled';

  useEffect(() => {
    if (!showLive) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (socketStatus === 'live') return;
    const interval = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(interval);
  }, [refresh, showLive, socketStatus]);
```

Delete `frontend/src/lib/dispatch/usePublicTrackingSocket.ts`. Grep the repo for `usePublicTrackingSocket` and `dispatch-tracking` WS paths; only this page should have used them.

- [ ] **Step 3: Typecheck / tests**

Run:

```
cd frontend && node --import tsx --test src/lib/dispatch/publicTrackingRealtime.test.ts
cd frontend && npx tsc --noEmit
```

Expected: tests PASS; `tsc` clean for the new files.

---

### Task 5: Remove backend tracking WebSocket and hub

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/monitor_notify.py`
- Modify: `backend/app/modules/delivery_dispatch/tracking_view.py`
- Modify: `backend/app/modules/delivery_dispatch/ws.py`
- Modify: `backend/app/main.py`
- Delete: `backend/app/infra/realtime/tracking_hub.py`
- Delete: `backend/tests/modules/test_tracking_realtime_hub.py`
- Modify: `backend/tests/api/test_restaurant_dispatch_requests.py` (delete `test_public_tracking_ws_sends_snapshot`)

**Interfaces:**
- Consumes: none of the tracking hub
- Produces: `notify_request_realtime` still notifies monitor + restaurant + rider; `notify_driver_location_realtime` still notifies monitor only

- [ ] **Step 1: Write the failing API assertion (WS gone)**

Replace `test_public_tracking_ws_sends_snapshot` with:

```python
@requires_db
def test_public_tracking_ws_route_removed(client):
    response = client.get("/api/v1/ws/public/dispatch-tracking/not-a-token")
    assert response.status_code in {404, 405}
```

Starlette may 404 the HTTP GET of a removed WS route. That is the assertion. Do **not** call `websocket_connect` on that path.

- [ ] **Step 2: Run it**

Run: `cd backend && .venv/bin/python -m pytest tests/api/test_restaurant_dispatch_requests.py::test_public_tracking_ws_route_removed -v --tb=short`

Expected: FAIL while the WS route still exists (upgrade handshake / 403 / non-404). If it already 404s because TestClient treats WS oddly, skip this test and just delete the old WS test.

- [ ] **Step 3: Delete hub emits and the WS handler**

`monitor_notify.py` final:

```python
def notify_request_realtime(session: Session, request: DeliveryDispatchRequest) -> None:
    notify_dispatch_monitor_changed(request.delivery_provider_id)
    get_restaurant_dispatch_realtime_hub().publish_sync(
        request.restaurant_id,
        {"type": "dispatch.updated"},
    )
    if request.assigned_driver_id is not None:
        notify_rider_updated(request.assigned_driver_id)


def notify_driver_location_realtime(session: Session, driver: DeliveryDriver) -> None:
    notify_dispatch_monitor_changed(driver.delivery_provider_id)
```

Remove `emit_public_tracking_snapshot` and `emit_public_tracking_location` from `tracking_view.py` (keep `build_public_tracking_dto`, `tracking_eta_seconds`, `LIVE_TRACKING_STATUSES`, rider DTO helpers). Remove the `tracking_hub` import.

Delete the entire `@router.websocket("/ws/public/dispatch-tracking/{token}")` function from `ws.py` and its `get_tracking_realtime_hub` import.

In `main.py` remove `get_tracking_realtime_hub` import, `bind_loop`, and `shutdown`.

Delete `tracking_hub.py` and `test_tracking_realtime_hub.py`.

Grep `emit_public_tracking` and `tracking_hub` — zero hits except docs.

- [ ] **Step 4: Run regression**

```
cd backend && .venv/bin/python -m pytest \
  tests/api/test_restaurant_dispatch_requests.py \
  tests/modules/test_tracking_realtime_sql.py \
  tests/modules/test_rider_location_and_itinerary_notify.py \
  tests/api/test_delivery_manual_offer.py \
  -v --tb=short
```

Expected: PASS. GET tracking tests still return the public DTO. Location notify test still asserts monitor notify, not tracking hub.

---

## Spec coverage (self-review)

| Spec section | Task |
|---|---|
| GET snapshot stays | Task 4 (front) + Task 5 leaves public API |
| Broadcast topic/events | Tasks 1–2 SQL, Task 3–4 front |
| Visibility + terminal status | Task 3 helpers, Task 4 hook/poll |
| `updated` columns only (not `next_attempt_at`) | Task 2 skip test |
| `location` live statuses only | Task 2 GPS test |
| no-op without `realtime.send` | Task 1 |
| Remove WS/hub | Task 5 |
| Monitor/rider unchanged | Task 5 `notify_*` still publish those hubs |
| Poll 20s only if visible, in course, not live | Task 4 `useEffect` |
| ETA SQL = Python | Task 1 |

No TBD. Channel name `tracking:${token}` is identical in SQL (`'tracking:' || token`) and `trackingBroadcastTopic`.

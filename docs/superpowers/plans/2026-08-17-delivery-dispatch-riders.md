# Rider Dispatch and Assignment Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Mexy register riders, let restaurants request a courier delivery by hand, and assign that request with cases A–D via Cloud Tasks — without a Cloud Run always-on poller.

**Architecture:** New tables (`delivery_drivers`, assignment settings, lead times, dispatch requests, offers, credit holds). Pure engine in `app/modules/delivery_dispatch/`. Same FastAPI process. Local `delivery_tasks_backend=stub`; production Cloud Tasks HTTP. Flutter `apps/rider` uses Google + FCM + background GPS.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest, Next.js (`delivery-dashboard`, `frontend`), Flutter (`apps/rider`), Supabase Auth/Storage, Google Cloud Tasks (prod only).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-17-delivery-dispatch-riders-design.es.md` — follow it over this plan if they conflict
- Do **not** assign digital-menu `orders`; do **not** reuse `delivery_assignments`
- Do **not** add an asyncio poller, Redis, or Celery for this flow
- Riders cover **all** zones; `zone_id` on a request is partnership/tariff only
- One form request = one dropoff = one rider
- Money in `*_cents`; credit default `50000`
- Errors: envelope `{ "error": { "message" } }`; Spanish copy **exact** from spec section 10
- UI: existing Inter/MUI tokens; MUI outlined icons; no emoji icons; labels on inputs; `role="alert"` on errors
- Owner/admin write drivers and assignment settings; operator GET only
- Restaurant dispatch requires **active** Mexy partnership; 403 `"No tienes un repartidor activo"`
- Commits: prepare clean diffs; skip `git commit` if the human prefers to commit themselves
- Next Alembic: `0052_delivery_dispatch` revises `0051_delivery_multi_zone`

## File map

| File | Responsibility |
|------|----------------|
| `backend/migrations/versions/0052_delivery_dispatch.py` | Schema + seed settings/lead times per existing provider |
| `backend/app/db/models/delivery.py` | New ORM classes |
| `backend/app/modules/delivery_dispatch/geo.py` | Haversine meters |
| `backend/app/modules/delivery_dispatch/search_at.py` | `compute_search_at` |
| `backend/app/modules/delivery_dispatch/engine.py` | Eligibility, demand, cases A–D, offer creation (pure + repo) |
| `backend/app/modules/delivery_dispatch/tasks.py` | Stub vs GCP enqueue; handle `search`/`expire_offer`/`retry` |
| `backend/app/modules/delivery_dispatch/service.py` | Drivers, settings, dispatch CRUD, rider actions, cash confirm |
| `backend/app/modules/delivery_dispatch/maps_url.py` | Parse Maps links to lat/lng |
| `backend/app/modules/delivery_dispatch/api.py` | Driver + settings + internal tasks routes |
| `backend/app/modules/delivery_dispatch/rider_api.py` | `/rider/me/*` |
| `backend/app/modules/restaurants/api.py` | `/restaurants/me/dispatch-requests*` |
| `backend/app/modules/public/api.py` | `GET /public/dispatch-tracking/{token}` |
| `backend/app/core/config.py` | `delivery_tasks_backend`, `delivery_tasks_secret` |
| `backend/app/api/v1/router.py` | Include dispatch + rider routers |
| `delivery-dashboard` Repartidores + Settings assignment section | Driver UI + config |
| `frontend` sidebar Delivery + form + `/rastreo/[token]` | Restaurant + public tracking |
| `apps/rider` | Flutter client |

---

### Task 1: Migration, models, `search_at`, assignment settings API + dashboard config

**Files:**
- Create: `backend/migrations/versions/0052_delivery_dispatch.py`
- Create: `backend/app/modules/delivery_dispatch/search_at.py`
- Create: `backend/tests/modules/test_delivery_search_at.py`
- Modify: `backend/app/db/models/delivery.py`
- Modify: `backend/app/core/config.py`
- Create: `backend/app/modules/delivery_dispatch/schemas.py`
- Create: `backend/app/modules/delivery_dispatch/service.py` (settings only in this task)
- Create: `backend/app/modules/delivery_dispatch/api.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `delivery-dashboard/src/lib/api/deliveryProviders.ts` + types
- Modify: `delivery-dashboard/src/components/pages/SettingsPage.tsx` (Asignación section)

**Interfaces:**
- Consumes: `0051_delivery_multi_zone`; `require_write_provider_config`
- Produces: `compute_search_at(now, ready_at, search_ahead_minutes) -> datetime`; `GET/PATCH /delivery-providers/me/assignment-settings`; `GET/PATCH /delivery-providers/me/search-lead-times`

- [ ] **Step 1: Write failing `search_at` tests**

```python
from datetime import datetime, timedelta, timezone
from app.modules.delivery_dispatch.search_at import compute_search_at

def test_prep_5_minutes_searches_immediately():
    now = datetime(2026, 8, 17, 12, 0, tzinfo=timezone.utc)
    ready = now + timedelta(minutes=5)
    assert compute_search_at(now, ready, search_ahead_minutes=0) == now

def test_prep_10_minutes_searches_five_before_ready():
    now = datetime(2026, 8, 17, 12, 0, tzinfo=timezone.utc)
    ready = now + timedelta(minutes=10)
    assert compute_search_at(now, ready, search_ahead_minutes=5) == now + timedelta(minutes=5)
```

- [ ] **Step 2: Run tests (expect fail)**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_delivery_search_at.py -v`  
Expected: FAIL import error

- [ ] **Step 3: Implement `compute_search_at`**

```python
from datetime import datetime, timedelta

def compute_search_at(now: datetime, ready_at: datetime, search_ahead_minutes: int) -> datetime:
    candidate = ready_at - timedelta(minutes=search_ahead_minutes)
    return now if candidate <= now else candidate
```

- [ ] **Step 4: Re-run tests** — expect PASS

- [ ] **Step 5: Write migration `0052_delivery_dispatch.py`**

`revision = "0052_delivery_dispatch"`, `down_revision = "0051_delivery_multi_zone"`.

Create tables exactly as spec §4 (drivers, assignment_settings, search_lead_times, dispatch_requests, dispatch_offers, credit_holds). Include:

- Unique index `uq_delivery_drivers_email_per_provider` on `(delivery_provider_id, lower(btrim(email)))`
- Partial unique: one `offered` offer per `driver_id` (`CREATE UNIQUE INDEX ... WHERE status = 'offered'`)
- Partial unique: one `offered` offer per `request_id`
- Seed: `INSERT` settings + 5 lead-time rows for every existing `delivery_providers.id`

Request status check:

```text
scheduled, searching, offered, assigned, picked_up, in_transit, delivered, unassigned, cancelled
```

`downgrade()` drops tables in reverse order.

- [ ] **Step 6: Add SQLAlchemy models** on `backend/app/db/models/delivery.py` matching the migration. Export them from `app/db/models/__init__.py` if that file lists models.

- [ ] **Step 7: Settings API**

`GET /delivery-providers/me/assignment-settings` — operator allowed.  
`PATCH` — `require_write_provider_config`.  
Same for `search-lead-times`: PATCH body is a list of `{prep_minutes, search_ahead_minutes}`; reject unknown `prep_minutes` with 400; do not delete rows.

Register router in `backend/app/api/v1/router.py`.

Settings fields + defaults from spec §4.2. Do **not** expose `pre_free_speed_mps` on PATCH.

- [ ] **Step 8: API tests** (skip if no DB): operator GET 200, operator PATCH 403, owner PATCH offer_timeout 45→60.

- [ ] **Step 9: Dashboard UI**

In Settings, new section **Asignación** with hint: “por empresa, no por zona”. Table of 5 prep rows + number inputs for timeout, pre-free seconds, staleness, protected drivers, demand thresholds, retry, timeout. Save via PATCH. Existing tokens/Inter.

- [ ] **Step 10: Commit**

```bash
git commit -m "feat(delivery): add dispatch schema and assignment settings"
```

---

### Task 2: Rider CRUD, uploads, Google claim, dashboard list

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/service.py`
- Modify: `backend/app/modules/delivery_dispatch/api.py`
- Modify: `backend/app/modules/delivery_providers/service.py` `get_me` — also call `claim_drivers(user_id, email)`
- Create: `backend/tests/api/test_delivery_drivers.py`
- Create: `delivery-dashboard/src/app/(panel)/repartidores/page.tsx`
- Create: `delivery-dashboard/src/components/pages/DriversPage.tsx` + CSS module
- Modify: `delivery-dashboard/src/components/ui/Sidebar.tsx` — item **Repartidores** with `TwoWheelerOutlined` or `MopedOutlined`

**Interfaces:**
- Consumes: Task 1 tables; StoragePort (extend uploads to PDF)
- Produces: `GET/POST /delivery-providers/me/drivers`; `GET/PATCH /delivery-providers/me/drivers/{id}`; `POST .../documents`; claim sets `user_id`, `status=active`, member `driver`

- [ ] **Step 1: Failing API test** — owner POST driver 201; operator POST 403 `"Tu rol no permite modificar esta configuración"`; duplicate email 409 `"Ya existe un repartidor con ese correo"`.

- [ ] **Step 2: Run test** — expect fail (404/missing route)

- [ ] **Step 3: Implement create**

POST body (JSON): names, phone, email, compartment, plate, brand, color, `credit_limit_cents` default 50000, document paths already uploaded **or** nested base64 like provider logo. Simplest path matching onboarding: `*_base64` + `*_file_name` for photo, ine, license, insurance in the same POST.

Accept `image/jpeg|png|webp` and `application/pdf`. Max 8 MB. 400 if oversize/wrong type.

On create: `status=invited`, `user_id=null`, `is_online=false`.

- [ ] **Step 4: Claim**

```python
def claim_drivers(self, user_id, email: str) -> None:
    normalized = email.strip().lower()
    # for each delivery_drivers row with that email and user_id is null:
    #   set user_id, status=active
    #   insert DeliveryProviderMember(role='driver') if missing
```

Call from `DeliveryProviderService.get_me` **and** from rider `GET /rider/me` (Task 4/6). Task 2: wire into `get_me` so a rider who opens the dashboard by mistake still claims.

- [ ] **Step 5: PATCH** — block (`status=blocked`, force `is_online=false`); edit ficha; **cannot** PATCH `credit_held_cents`.

- [ ] **Step 6: Dashboard page**

List: photo, `first_name last_name`, email, available credit `(limit-held)/100` as money, compartment, status chip (Invitado / Activo / Bloqueado) + En línea if online. Owner/admin: **Dar de alta** form (scrollable page, not a clipped modal). Operator: no submit button.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(delivery): register riders with Google claim"
```

---

### Task 3: Restaurant dispatch API, form, public tracking

**Files:**
- Create: `backend/app/modules/delivery_dispatch/maps_url.py`
- Create: `backend/tests/modules/test_delivery_maps_url.py`
- Modify: restaurants API
- Modify: `backend/app/modules/public/api.py`
- Modify: `frontend/src/components/ui/Sidebar.tsx`
- Create: `frontend/src/app/(panel)/delivery/page.tsx` + form component
- Create: `frontend/src/app/rastreo/[token]/page.tsx`
- Modify: `frontend/src/middleware.ts` — do **not** skip `/rastreo` on subdomain rewrite (it should rewrite `{sub}.host/rastreo/TOKEN` → `/rastreo/TOKEN` plus subdomain context). Keep current rewrite: `{sub}.host/rastreo/x` → `/menu/{sub}/rastreo/x` **or** add a dedicated rewrite to `/rastreo/x` with subdomain header. Prefer: rewrite `pathname.startsWith('/rastreo')` to `/rastreo/...` and pass subdomain via existing host parse in the page (read `Host`, don’t nest under `/menu/`).

**Interfaces:**
- Consumes: active partnership + quote service + `compute_search_at`
- Produces: dispatch CRUD; tracking DTO without PII

- [ ] **Step 1: Maps URL tests**

```python
def test_parses_at_lat_lng():
    assert parse_maps_url("https://www.google.com/maps/@19.43,-99.13,17z") == (19.43, -99.13)

def test_rejects_garbage():
    assert parse_maps_url("https://example.com") is None
```

Implement `ll=`, `/@lat,lng`, `!3d!4d` if cheap. Short links (`maps.app.goo.gl`): HTTP resolve (follow redirects, cap 5) in the **service**, not the pure parser; if still no coords, 400 `"No se pudo leer la ubicación del enlace"`.

- [ ] **Step 2: Failing API test** — restaurant without partnership POST 403 `"No tienes un repartidor activo"`. With active partnership and prep_minutes=5, 201, `status=scheduled` or `searching` if search_at==now, `tracking_token` set, `quoted_fee_cents` from existing quote. Invalid prep 400.

Do **not** enqueue Cloud Tasks yet (stub no-op). `search_at` must still be persisted.

- [ ] **Step 3: Implement POST**

Require `package_count >= 1`. If `payment_method==cash`, require `cash_denomination_cents`. Transfer may have `collect_cents=0`. Quote using restaurant lat/lng as pickup and dropoff as destination via existing `quote_delivery` / public quote service — if quote fails, return that 400 message.

PATCH payment: if `assigned_driver_id` is not null, 409 `"Ya hay un repartidor asignado"`. Allow when status in `scheduled|searching|offered|unassigned`.

Cancel: set `cancelled`. Retry: only `unassigned` → `searching`, `search_at=now`.

`confirm-rider-cash`: hold must be `held`; from `assigned` onward; set `released` and decrement `credit_held_cents`.

- [ ] **Step 4: Public GET** `/public/dispatch-tracking/{token}` — 404 if missing. Body: status, dropoff, customer first name optional skip (spec: no extra rider phone). Rider `first_name` only if assigned.

- [ ] **Step 5: Frontend**

Sidebar **Delivery** only if partnership active (reuse Hours/Settings partnership fetch). Form copy **exact**: `Máximo 20 kg en la suma de todos los paquetes.` Places search + paste Maps URL. After create: show search time + copy tracking link `{publicMenuOrigin}/rastreo/{token}`.

Tracking page: map + status text+icon.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(delivery): let restaurants request courier dispatch"
```

---

### Task 4: Engine A/B, offers, task stub, credit holds

**Files:**
- Create: `backend/app/modules/delivery_dispatch/geo.py`
- Create: `backend/app/modules/delivery_dispatch/engine.py`
- Create: `backend/app/modules/delivery_dispatch/tasks.py`
- Create: `backend/app/modules/delivery_dispatch/rider_api.py`
- Create: `backend/tests/modules/test_delivery_assignment_engine.py`
- Modify: `backend/app/core/config.py` — `delivery_tasks_backend: str = "stub"`; `delivery_tasks_secret: str | None = None`

**Interfaces:**
- Consumes: dispatch rows, drivers, settings
- Produces: `run_search(request_id, now)`; `POST /internal/delivery/tasks`; rider offer accept/reject

- [ ] **Step 1: Geo helper**

```python
def geodesic_meters(lat1, lng1, lat2, lng2) -> float:
    # haversine, earth radius 6371000
```

Test: CDMX two nearby points > 0 and < 20_000.

- [ ] **Step 2: Failing engine tests** (in-memory dataclasses, no DB):

```python
def test_case_a_picks_nearest_to_restaurant():
    ...
    result = choose_assignments(context)
    assert result.case == "A"
    assert result.offers[0].driver_id == "near"

def test_stale_gps_excluded():
    ...

def test_grande_excludes_normal_compartment():
    ...

def test_cash_excludes_insufficient_credit():
    ...
```

Clock and locations injected on a `EngineContext` TypedDict/dataclass: settings, restaurant lat/lng, request, sibling due requests, drivers with last_lat, location_updated_at, credit, compartment, active_request_status.

- [ ] **Step 3: Implement A + filters only** (B in same task)

Case A: `high_demand` false → nearest geodesic to **restaurant**.  
Case B: `high_demand` false and `len(due_siblings including self) > 1` → assign distinct free drivers, stop while `free_remaining >= min_protected_drivers` after this tick; if not enough usable, set `high_demand=True` and fall through (C/D not implemented yet → behave as retry empty).

For Task 4, if high_demand after B fail: return no offers (retry path). Do not implement C/D here.

- [ ] **Step 4: Persistence + stub tasks**

`TaskBus.enqueue(kind, eta, payload)`  
Stub: store on a list; tests call `handle_task` directly.  
`handle_search`: `SELECT ... FOR UPDATE SKIP LOCKED`; create offer; set request `offered`; enqueue expire at `now+offer_timeout`.

`POST /internal/delivery/tasks`: if backend is stub **or** `X-Delivery-Tasks-Secret == settings.delivery_tasks_secret`, run handler. Else 401.

On restaurant POST (Task 3): enqueue `search` at `search_at`.

- [ ] **Step 5: Rider routes**

`GET /rider/me` — claim drivers + profile.  
`PATCH /rider/me/online`.  
`POST /rider/me/location`.  
`GET /rider/me/offers`.  
`POST /rider/me/offers/{id}/accept` — 409 `"La oferta ya no está disponible"` if not `offered`. On accept cash: insert hold, increment `credit_held_cents`.  
`POST .../reject` — mark rejected; immediately `run_search` again excluding that driver for this cycle (pass `excluded_driver_ids` on the request row JSON or a column `search_cycle_rejected_ids` UUID[] — add `rejected_driver_ids` UUID[] default `{}` on the request in a **small follow-up alter** if not in 0052; if 0052 already shipped in Task 1, add nullable `JSONB` `cycle_rejected_driver_ids` in 0052 **now** if Task 1 not merged, otherwise include it in 0052 from the start).

**Do this in Task 1 migration if still editable:** `cycle_rejected_driver_ids UUID[] NOT NULL DEFAULT '{}'`. Reset to `{}` on retry/unassigned.

- [ ] **Step 6: Expire handler** — set offer `expired`, request `searching`, run_search again (expired rider may be chosen on a **later** retry cycle, not the same cycle — put expired-no-response IDs in a separate `cycle_silent_driver_ids` only until retry resets). Spec: silent rider **can** appear on retry; rejected cannot until retry. Reset both arrays when enqueueing retry (`next_attempt_at`).

- [ ] **Step 7: Tests for hold/release** — accept cash increments held; confirm-rider-cash releases.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(delivery): assign nearest rider and hold cash credit"
```

---

### Task 5: Cases C/D, pre-free, assignment timeout

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/engine.py`
- Modify: `backend/tests/modules/test_delivery_assignment_engine.py`

- [ ] **Step 1: Failing tests**

- Pre-free: driver `in_transit`, geodesic/8 <= 60s, treated as free for A  
- Stale GPS still excluded even if in_transit  
- Case B: two due requests, three free drivers, `min_protected_drivers=2` → only **one** request offered this tick (usable = 3-2 = 1) **or** two if the spec’s “parallel” uses usable_capacity for **count of requests**. Spec: `libres - asignaciones_de_este_tick >= min_protected_drivers`. With 3 free and 2 due, assigning 1 leaves 2 protected. Assigning 2 leaves 1 — not allowed. So 1 offer.  
- High demand + two dropoffs within 800m → C, one driver, two request ids in a **group**. Persist `group_id` UUID nullable on requests (add column in 0052 if missing: `dispatch_group_id UUID`).  
- Timeout: `now >= search_at + 900` → `unassigned`

- [ ] **Step 2: Implement C/D + pre-free + timeout** as spec §6.2–6.4.

Case C v1: radius only (`near_destination_radius_meters`), not Duration Matrix.

Case D: discard candidate if pickup or dropoff extra minutes (`geodesic / speed / 60`) exceed max detour settings.

- [ ] **Step 3: FCM hook**

`notify_offer(driver, offer)` — if no `fcm_token`, skip. Production: HTTP to FCM (or skip with log). Tests: fake notifier list.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(delivery): add high-demand assignment cases and pre-free"
```

---

### Task 6: Flutter rider app

**Files:**
- `apps/rider/` (existing `mexy_rider` stub)

**Interfaces:**
- Consumes: `/rider/me*` with Supabase JWT (`Authorization: Bearer`)
- Produces: Google login, online toggle, background location, FCM offer UI, delivery actions

- [ ] **Step 1: Auth**

`google_sign_in` + `supabase_flutter` (same project as dashboards). On success `GET /rider/me`. If 403/no driver row: Spanish screen “Tu correo no está dado de alta. Pide a Mexy que te registre.”

- [ ] **Step 2: Online toggle**

Persisted via PATCH. Label **En línea**. Off = stop foreground service. On = request Always location + Android foreground notification **exact**: `Mexy usa tu ubicación`. Ping `POST /rider/me/location` every 15s.

iOS onboarding copy: if they swipe-kill the app, GPS stops and they will not get offers until they open it again.

- [ ] **Step 3: Offers**

Poll `GET /rider/me/offers` every 5s while online **and** FCM. Full-screen offer, countdown from `expires_at`. Accept / Rechazar.

- [ ] **Step 4: Active job**

List assigned+picked_up+in_transit (from `/rider/me`). Buttons Recogí / En camino / Entregué. If a second assigned (pre-free queue) exists, show “Luego: recoger en {restaurant}”.

- [ ] **Step 5: Manual smoke**

Cannot fully pytest Flutter here. Document: run `flutter test` for any Dart unit tests of countdown parsing; `flutter analyze` must be clean.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(rider): online toggle, offers, and delivery flow"
```

---

## GCP note (ops, not a code task)

Production: Cloud Tasks queue, OIDC or `X-Delivery-Tasks-Secret`, `delivery_tasks_backend=gcp`. Cloud Run `min instances = 0` stays. Do not enable CPU-always for this feature.

---

## Self-review vs spec

| Spec | Task |
|------|------|
| §4 schema, settings, lead times | 1 |
| §4.1 drivers, claim, dashboard | 2 |
| §4.4–4.5 dispatch + tracking + restaurant UI | 3 |
| §6 A/B, offers, tasks stub, credit | 4 |
| §6 C/D, pre-free, timeout, FCM hook | 5 |
| §9.4 Flutter GPS/FCM | 6 |
| No menu-order assignment, no Redis poller | Global |
| Exact 403/409 copy | 2, 3, 4 |

If Task 1 already ran without `cycle_rejected_driver_ids` / `dispatch_group_id`, add them in Task 1 before merge — they are required by Tasks 4–5.

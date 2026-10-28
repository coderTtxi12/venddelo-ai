# Terminal Hold Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record who physically has a restaurant terminal after pickup on `card_terminal` orders, keep that record after the order closes, and show it on restaurant Delivery, rider, and the Mexy monitor until the restaurant releases it.

**Architecture:** New `delivery_terminal_holds` row, created in `transition_assignment(..., "picked_up")`, never transferred, never auto-released. Restaurant `POST .../confirm-terminal-return` is the only writer to `released`. Credit holds, `credit_held_cents`, and the assignment engine stay untouched.

**Tech Stack:** FastAPI / SQLAlchemy / Alembic, pytest, Next.js (restaurant `frontend/` + `delivery-dashboard/`) with `node --import tsx --test`, Flutter rider (`apps/rider`) with `flutter test`.

**Spec:** `docs/superpowers/specs/2026-10-22-terminal-hold-observability-design.es.md`

## Global Constraints

- Copy: panel/chip `Terminal retenida`; button `Liberar terminal`; chip n `{n} terminales retenidas`; monitor panel/metric `Terminales retenidas`; empty `Sin terminales retenidas.`; restaurant subtitle `Riders que todavía tienen tu terminal.`
- Confirm copy step 1: title `¿Ya te devolvió la terminal?` / body `Esto quita la retención al repartidor. Confírmalo solo si ya tienes la terminal en tu negocio.`
- Confirm copy step 2: `Vas a marcar que {nombre} ya te entregó la terminal de {short_id}.`
- Do not add a `kind` on `delivery_credit_holds`. Do not write `credit_held_cents` for terminal holds.
- Do not block offers, assignment, or rider capacity because a terminal is held.
- Do not auto-release on deliver, cancel, or reassignment.
- Do not add a delivery-provider release endpoint.
- Do not backfill old pickups. Do not add FCM. Do not touch Mexy app or the public menu.
- Alembic revision: `0085_delivery_terminal_holds`, revises `0084_product_menu_schedule`.
- Reuse `DispatchRiderCreditPanel.module.css` for the restaurant terminal panel.

## Review Focus

- Pickup `card_terminal` must leave `credit_held_cents` unchanged — Task 2.
- After deliver, `GET /rider/me` has empty `assignments` but still lists the hold — Task 4.
- After post-pickup reassignment, release notifies the original holder (`GET /rider/me` as that rider) — Task 3.
- Monitor snapshot includes the hold when `request.status == delivered` — Task 5.
- Second pickup by the new rider after reassignment must keep the original `driver_id` — Task 2.

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/migrations/versions/0085_delivery_terminal_holds.py` | Table + indexes |
| `backend/app/db/models/delivery.py` | `DeliveryTerminalHold` + relationships |
| `backend/app/modules/delivery_dispatch/terminal.py` | ensure / release / list helpers |
| `backend/app/modules/delivery_dispatch/schemas.py` | DTO fields for restaurant, rider, monitor |
| `backend/app/modules/delivery_dispatch/service.py` | Pickup create, confirm, DTO mapping |
| `backend/app/modules/delivery_dispatch/history.py` | Rider history `active_terminal_holds` |
| `backend/app/modules/delivery_dispatch/monitor.py` | Snapshot list + metric |
| `backend/app/modules/delivery_dispatch/monitor_notify.py` | Rider payload may include `terminal_holds` |
| `backend/app/modules/restaurants/api.py` | Confirm route |
| `frontend/src/lib/dispatch/riderTerminalHold.ts` | Held grouping for restaurant panel |
| `frontend/src/components/dispatch/DispatchTerminalHoldPanel.tsx` | Restaurant release panel |
| `frontend/src/components/dispatch/DispatchRecentRequests.tsx` | Row button |
| `frontend/src/components/pages/DeliveryPage.tsx` | Confirm flow |
| `frontend/src/lib/api/dispatch.ts` | Types + `confirmDispatchTerminalReturn` |
| `apps/rider/lib/models.dart` | Profile/history parse + realtime apply |
| `apps/rider/lib/screens/home_screen.dart` | Chip |
| `apps/rider/lib/screens/account_screen.dart` | History list |
| `delivery-dashboard/src/lib/api/types.ts` | Snapshot types |
| `delivery-dashboard/src/components/pages/MonitorPage.tsx` | Metric + list, no release button |

---

### Task 1: Table, model, helpers

**Files:**
- Create: `backend/migrations/versions/0085_delivery_terminal_holds.py`
- Create: `backend/app/modules/delivery_dispatch/terminal.py`
- Modify: `backend/app/db/models/delivery.py` — add `DeliveryTerminalHold`; `DeliveryDispatchRequest.terminal_hold`; `DeliveryDriver.terminal_holds`
- Test: `backend/tests/modules/test_delivery_terminal_holds.py`

**Interfaces:**
- Consumes: Alembic head `0084_product_menu_schedule`
- Produces:
  - `class DeliveryTerminalHold` with `request_id` unique, `driver_id`, `status` in `held|released`, `held_at`, `released_at`, `released_by_user_id`
  - `ensure_terminal_hold(session, request, driver, *, now: datetime) -> DeliveryTerminalHold | None`
  - `release_terminal_hold(hold, *, released_by_user_id, now: datetime) -> DeliveryTerminalHold`
  - `list_held_terminal_holds(session, *, driver_id: UUID | None = None, provider_id: UUID | None = None) -> list[DeliveryTerminalHold]`

- [ ] **Step 1: Write the failing test**

```python
def test_ensure_terminal_hold_skips_cash_and_is_idempotent_for_terminal():
    now = datetime.now(UTC)
    cash = SimpleNamespace(payment_method="cash", terminal_hold=None)
    assert ensure_terminal_hold(MagicMock(), cash, SimpleNamespace(id=uuid.uuid4()), now=now) is None

    existing = SimpleNamespace(id=uuid.uuid4(), driver_id=uuid.uuid4())
    terminal = SimpleNamespace(payment_method="card_terminal", terminal_hold=existing)
    assert ensure_terminal_hold(MagicMock(), terminal, SimpleNamespace(id=uuid.uuid4()), now=now) is existing
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/modules/test_delivery_terminal_holds.py::test_ensure_terminal_hold_skips_cash_and_is_idempotent_for_terminal -v`

Expected: FAIL with `ensure_terminal_hold` not defined

- [ ] **Step 3: Implement model, migration, and helpers**

Migration table `delivery_terminal_holds`, FKs `ondelete=CASCADE` for request/driver, `released_by_user_id` SET NULL, check `status IN ('held','released')`, unique `request_id`, indexes `(driver_id, status)` and `(status)`.

`ensure_terminal_hold` returns `None` unless `payment_method == "card_terminal"`; if `request.terminal_hold` exists, return it unchanged (do not change `driver_id`); otherwise add a `held` row.

`release_terminal_hold` sets `status="released"`, `released_at`, `released_by_user_id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/modules/test_delivery_terminal_holds.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/versions/0085_delivery_terminal_holds.py backend/app/db/models/delivery.py backend/app/modules/delivery_dispatch/terminal.py backend/tests/modules/test_delivery_terminal_holds.py
git commit -m "feat: add delivery terminal hold model"
```

---

### Task 2: Create on pickup, survive close and reassignment

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/service.py` — `transition_assignment` when `new_status == "picked_up"`; do not touch holds in `_swap_assigned_driver` or cancel/deliver
- Test: `backend/tests/api/test_delivery_terminal_holds.py`

**Interfaces:**
- Consumes: `ensure_terminal_hold` from Task 1
- Produces: a `held` row on first `POST /api/v1/rider/me/assignments/{id}/picked-up` for `card_terminal`

Reuse `_setup_ready_rider` / `_as_owner` / `_as_rider` from `tests/api/test_delivery_rider_offers.py`. Create requests with `_dispatch_payload(payment_method="card_terminal")` and omit cash denomination. Include `delivery_terminal_holds` in this file’s TRUNCATE.

- [ ] **Step 1: Write the failing tests**

```python
def test_pickup_card_terminal_creates_hold_cash_does_not():
    # cash pickup: no DeliveryTerminalHold; credit_held_cents still 25000
    # card_terminal pickup: one hold, status held, driver_id = picker
    # same driver’s credit_held_cents unchanged vs pre-pickup

def test_hold_survives_deliver_and_stays_on_original_rider_after_reassign():
    # pickup card_terminal as rider A, deliver → hold still held, driver_id = A
    # new request: pickup as A, then provider manual-offer + accept as rider B
    # hold.driver_id still A; request.status == assigned; request.assigned_driver_id == B
    # B posts picked-up → still one row, driver_id still A
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest backend/tests/api/test_delivery_terminal_holds.py -v`

Expected: FAIL — no hold row after pickup

- [ ] **Step 3: Call `ensure_terminal_hold` in `transition_assignment` when `new_status == "picked_up"`**

Use `request.assigned_driver` (locked picker). Do not call ensure on assign. Do not release on deliver/cancel. Do not update `driver_id` in `_swap_assigned_driver`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backend/tests/api/test_delivery_terminal_holds.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/delivery_dispatch/service.py backend/tests/api/test_delivery_terminal_holds.py
git commit -m "feat: retain terminal on card_terminal pickup"
```

---

### Task 3: Restaurant DTO + confirm endpoint

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/schemas.py` — `DispatchRequestDTO`, add `TerminalHolderDTO`
- Modify: `backend/app/modules/delivery_dispatch/service.py` — `_to_dto`, `confirm_terminal_return`
- Modify: `backend/app/modules/restaurants/api.py` — route
- Modify: `backend/app/modules/delivery_dispatch/monitor_notify.py` — `notify_rider_updated(..., terminal_holds=None)`
- Test: `backend/tests/api/test_delivery_terminal_holds.py`

**Interfaces:**
- Consumes: `release_terminal_hold`, `list_held_terminal_holds` from Task 1
- Produces:
  - `class TerminalHolderDTO: driver_id: UUID; first_name: str; photo_url: str | None`
  - `DispatchRequestDTO.terminal_hold_status: Literal["held","released"] | None = None`
  - `DispatchRequestDTO.terminal_holder: TerminalHolderDTO | None = None` — from hold.driver, not `assigned_driver`
  - `RestaurantDispatchService.confirm_terminal_return(restaurant, request_id, user_id) -> DispatchRequestDTO`
  - `POST /api/v1/restaurants/me/dispatch-requests/{request_id}/confirm-terminal-return`
  - After pickup and after release, `notify_rider_updated(hold.driver_id, terminal_holds=...)` even if `assigned_driver_id` differs. `notify_request_realtime` must not be the only notify: the holder can differ from the assigned rider.

- [ ] **Step 1: Write the failing tests**

```python
def test_list_and_confirm_terminal_return():
    # after pickup: list DTO terminal_hold_status == "held", terminal_holder.driver_id == picker
    # POST confirm-terminal-return → 200, status released, holder still present
    # second POST → 400
    # credit_held_cents unchanged

def test_confirm_after_reassign_releases_original_holder():
    # pickup A, manual-offer accept B (status assigned)
    # POST confirm as restaurant → 200
    # GET /rider/me as A: terminal_holds == []
    # GET /rider/me as B: terminal_holds == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest backend/tests/api/test_delivery_terminal_holds.py::test_list_and_confirm_terminal_return backend/tests/api/test_delivery_terminal_holds.py::test_confirm_after_reassign_releases_original_holder -v`

Expected: FAIL — route 404 or field missing

- [ ] **Step 3: Implement DTO mapping, route, and confirm**

400 with Spanish validation if no `held` hold. Status of the request is ignored. No provider route. `photo_url` uses the same storage helper as `build_tracking_rider_dto`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backend/tests/api/test_delivery_terminal_holds.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/delivery_dispatch/schemas.py backend/app/modules/delivery_dispatch/service.py backend/app/modules/restaurants/api.py backend/app/modules/delivery_dispatch/monitor_notify.py backend/tests/api/test_delivery_terminal_holds.py
git commit -m "feat: let restaurants release terminal holds"
```

---

### Task 4: Rider profile and history payloads

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/schemas.py` — `RiderTerminalHoldDTO`, `RiderProfileDTO.terminal_holds`, `RiderHistoryPageDTO.active_terminal_holds`
- Modify: `backend/app/modules/delivery_dispatch/service.py` — `_to_profile`
- Modify: `backend/app/modules/delivery_dispatch/history.py` — `list_active_terminal_holds` (or reuse `list_held_terminal_holds`)
- Test: `backend/tests/api/test_delivery_terminal_holds.py`

**Interfaces:**
- Consumes: `list_held_terminal_holds(session, driver_id=...)`
- Produces:
  - `class RiderTerminalHoldDTO: request_id: UUID; short_id: str; restaurant_name: str; restaurant_id: UUID; held_at: datetime`
  - `RiderProfileDTO.terminal_holds: list[RiderTerminalHoldDTO] = []`
  - `RiderHistoryPageDTO.active_terminal_holds: list[RiderTerminalHoldDTO] = []`

- [ ] **Step 1: Write the failing test**

```python
def test_rider_me_lists_hold_after_deliver():
    # pickup card_terminal, deliver
    # GET /rider/me → assignments == [], terminal_holds == [{restaurant_name, short_id, request_id}]
    # GET rider history → active_terminal_holds same ids
    # after restaurant confirm → both lists empty
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/api/test_delivery_terminal_holds.py::test_rider_me_lists_hold_after_deliver -v`

Expected: FAIL — `terminal_holds` missing or empty after deliver

- [ ] **Step 3: Attach held holds in `_to_profile` and history page builder**

Query by `hold.driver_id`, not `assigned_driver_id`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backend/tests/api/test_delivery_terminal_holds.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/delivery_dispatch/schemas.py backend/app/modules/delivery_dispatch/service.py backend/app/modules/delivery_dispatch/history.py backend/tests/api/test_delivery_terminal_holds.py
git commit -m "feat: expose rider terminal holds after delivery"
```

---

### Task 5: Monitor snapshot

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/schemas.py` — `DispatchMonitorTerminalHoldDTO`, `DispatchMonitorMetricsDTO.terminal_holds_active`, `DispatchMonitorSnapshotDTO.terminal_holds`
- Modify: `backend/app/modules/delivery_dispatch/monitor.py` — query held rows for the provider (and zone filter like credit holds)
- Test: `backend/tests/api/test_delivery_terminal_holds.py`

**Interfaces:**
- Consumes: `list_held_terminal_holds(session, provider_id=...)`
- Produces:
  - `DispatchMonitorTerminalHoldDTO(id, request_id, short_id, driver_id, driver_name, restaurant_id, restaurant_name, customer_name, held_at, request_status)`
  - `metrics.terminal_holds_active: int`
  - `snapshot.terminal_holds: list[DispatchMonitorTerminalHoldDTO]`

- [ ] **Step 1: Write the failing test**

```python
def test_monitor_lists_terminal_hold_after_deliver():
    # pickup + deliver card_terminal
    # GET /api/v1/delivery-providers/me/dispatch-monitor as Mexy
    # metrics.terminal_holds_active == 1
    # terminal_holds[0].driver_name, restaurant_name, short_id, request_status == "delivered"
    # after confirm: metric 0, list empty
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/api/test_delivery_terminal_holds.py::test_monitor_lists_terminal_hold_after_deliver -v`

Expected: FAIL — field missing or count 0

- [ ] **Step 3: Query holds independently of the live-request list**

Do not require the request to be in `_IN_PROGRESS_STATUSES`. Apply the same `zone_id` filter as credit holds.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backend/tests/api/test_delivery_terminal_holds.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/delivery_dispatch/schemas.py backend/app/modules/delivery_dispatch/monitor.py backend/tests/api/test_delivery_terminal_holds.py
git commit -m "feat: list retained terminals on dispatch monitor"
```

---

### Task 6: Restaurant Delivery UI

**Files:**
- Create: `frontend/src/lib/dispatch/riderTerminalHold.ts`
- Create: `frontend/src/lib/dispatch/riderTerminalHold.test.ts`
- Create: `frontend/src/components/dispatch/DispatchTerminalHoldPanel.tsx` (import `DispatchRiderCreditPanel.module.css`)
- Modify: `frontend/src/lib/api/dispatch.ts` — types + `confirmDispatchTerminalReturn`
- Modify: `frontend/src/components/dispatch/DispatchRecentRequests.tsx`
- Modify: `frontend/src/components/pages/DeliveryPage.tsx`

**Interfaces:**
- Consumes: `DispatchRequest.terminal_hold_status`, `terminal_holder`
- Produces:
  - `hasHeldTerminal(request): boolean` — `terminal_hold_status === 'held'`
  - `groupHeldTerminals(requests)` — groups by `terminal_holder.driver_id`
  - `confirmDispatchTerminalReturn(token, restaurantId, requestId)` → `POST .../confirm-terminal-return`

- [ ] **Step 1: Write the failing test**

```ts
test('groups held terminals by holder not assigned rider', () => {
  const rows = [
    request({ id: 'a', terminal_hold_status: 'held', terminal_holder: { driver_id: 'r1', first_name: 'Ana', photo_url: null }, assigned_driver_id: 'r2', status: 'assigned' }),
    request({ id: 'b', terminal_hold_status: 'released', terminal_holder: { driver_id: 'r1', first_name: 'Ana', photo_url: null } }),
  ];
  assert.equal(hasHeldTerminal(rows[0]), true);
  assert.equal(hasHeldTerminal(rows[1]), false);
  const groups = groupHeldTerminals(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].riderName, 'Ana');
  assert.deepEqual(groups[0].requests.map((row) => row.id), ['a']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test frontend/src/lib/dispatch/riderTerminalHold.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement helper, panel, row button, and two-step confirm**

Extend `confirm.kind` with `'terminal'`. Show **Liberar terminal** when `hasHeldTerminal(request)` in active and history. Panel title/subtitle/button from Global Constraints. Place the panel next to `DispatchRiderCreditPanel`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test frontend/src/lib/dispatch/riderTerminalHold.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dispatch/riderTerminalHold.ts frontend/src/lib/dispatch/riderTerminalHold.test.ts frontend/src/components/dispatch/DispatchTerminalHoldPanel.tsx frontend/src/lib/api/dispatch.ts frontend/src/components/dispatch/DispatchRecentRequests.tsx frontend/src/components/pages/DeliveryPage.tsx
git commit -m "feat: restaurant UI to release retained terminals"
```

---

### Task 7: Rider app

**Files:**
- Modify: `apps/rider/lib/models.dart`
- Modify: `apps/rider/lib/screens/home_screen.dart`
- Modify: `apps/rider/lib/screens/account_screen.dart`
- Test: `apps/rider/test/models_test.dart`

**Interfaces:**
- Consumes: `terminal_holds` / `active_terminal_holds` from Task 4; optional `terminal_holds` on `rider.updated`
- Produces:
  - `class RiderTerminalHold { requestId, shortId, restaurantName, restaurantId, heldAt }`
  - `RiderProfile.terminalHolds`
  - `RiderHistoryPage.activeTerminalHolds`
  - `RiderProfile applyRiderTerminalHoldsFromEvent(profile, event)` — if `event['terminal_holds']` is a List, replace `terminalHolds`

- [ ] **Step 1: Write the failing test**

```dart
test('RiderProfile parses terminal holds and realtime replace', () {
  final profile = RiderProfile.fromJson({
    'id': 'd1',
    'first_name': 'Ana',
    'last_name': 'Pérez',
    'is_online': true,
    'assignments': const [],
    'terminal_holds': [
      {
        'request_id': 'req-1',
        'short_id': 'AB12C',
        'restaurant_name': 'Tacos',
        'restaurant_id': 'rest-1',
        'held_at': '2026-10-22T12:00:00+00:00',
      },
    ],
  });
  expect(profile.terminalHolds, hasLength(1));
  expect(profile.terminalHolds.first.restaurantName, 'Tacos');
  expect(
    applyRiderTerminalHoldsFromEvent(profile, {'terminal_holds': []}).terminalHolds,
    isEmpty,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/models_test.dart --name "parses terminal holds"` in `apps/rider`

Expected: FAIL — field not found

- [ ] **Step 3: Parse fields, apply realtime, render chip and history block**

Home chip only if `terminalHolds.isNotEmpty`: 1 → `Terminal retenida`; else `{n} terminales retenidas`. History block title `Terminales retenidas`, rows restaurant + short id. No release action. Wire `applyRiderTerminalHoldsFromEvent` where `applyRiderCreditFromEvent` already runs.

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/models_test.dart --name "parses terminal holds"` in `apps/rider`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/rider/lib/models.dart apps/rider/lib/screens/home_screen.dart apps/rider/lib/screens/account_screen.dart apps/rider/test/models_test.dart
git commit -m "feat: show retained terminals in the rider app"
```

---

### Task 8: Delivery dashboard monitor

**Files:**
- Modify: `delivery-dashboard/src/lib/api/types.ts`
- Modify: `delivery-dashboard/src/lib/dispatch/applyDriverLocation.test.ts` — fixture defaults
- Modify: `delivery-dashboard/src/components/pages/MonitorPage.tsx`
- Test: `delivery-dashboard/src/lib/dispatch/applyDriverLocation.test.ts`

**Interfaces:**
- Consumes: `metrics.terminal_holds_active`, `snapshot.terminal_holds`
- Produces: metric card + panel with no release button. Row title `{driver_name}`; meta `{short_id} · {customer_name} · {restaurant_name}` plus `request_status`. Empty copy `Sin terminales retenidas.`

- [ ] **Step 1: Write the failing assertion**

In `snapshot()` fixture of `applyDriverLocation.test.ts`, add `terminal_holds_active: 0` and `terminal_holds: []`. Add a type-level test file only if the existing test fails to compile without those fields — the compile/test run is the gate.

- [ ] **Step 2: Run test to verify fixture/types fail or compile error**

Run: `node --import tsx --test delivery-dashboard/src/lib/dispatch/applyDriverLocation.test.ts`

Expected: Type/compile error or missing fields until types are updated

- [ ] **Step 3: Add types, fixture fields, metric, and `TerminalList` panel**

Place the panel next to `Crédito retenido`. Sort like credit (`timeSort`). No `onRelease`. Do not render a Liberar button.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test delivery-dashboard/src/lib/dispatch/applyDriverLocation.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add delivery-dashboard/src/lib/api/types.ts delivery-dashboard/src/lib/dispatch/applyDriverLocation.test.ts delivery-dashboard/src/components/pages/MonitorPage.tsx
git commit -m "feat: show retained terminals on the delivery monitor"
```

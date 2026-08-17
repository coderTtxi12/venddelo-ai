# Multi-Zone Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a delivery company run multiple operational zones, and match restaurant onboarding to the nearest Mexy zone in range without breaking existing Mexy partnerships.

**Architecture:** Move pricing, schedules, weather, and pause from provider to zone (1:1). Persist `zone_id` on `restaurant_delivery_providers`. Match restaurants with PostGIS `ST_Distance` against Mexy zones only. Courier UI selects a zone; restaurant onboarding shows at most one coverage card.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostGIS, pytest, Next.js (`delivery-dashboard`, `frontend`), existing CSS modules + MUI icons.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-16-delivery-multi-zone-design.es.md`
- Matching: only Mexy (`is_mexy_provider_slug`); geodesic `ST_Distance`, not Distance Matrix
- No coverage → delivery may stay on; **do not** insert `restaurant_delivery_providers`
- Unique zone name per provider: `lower(btrim(name))`
- Cannot delete a zone with partnerships; cannot delete the last zone
- Restaurant never sends `zone_id`; server rematches from lat/lng
- Existing Mexy partnerships keep `active`/`pending` on the current primary zone
- Pause/weather/hours/tariffs are per zone; timezone and payment methods stay on the provider
- UI: existing tokens/Inter/MUI; no emoji icons; `cursor-pointer` on chips/cards; empty states with title + action
- Error copy is Spanish and exact (section 8 of the spec)
- Operator: GET zones 200; POST/PATCH/DELETE zona and PUT tarifas/horarios 403; weather, pause, accept/reject, reassign allowed
- Commits: prepare clean diffs; skip `git commit` if the human prefers to commit themselves

## File map

| File | Responsibility |
|------|----------------|
| `backend/migrations/versions/0051_delivery_provider_multi_zone.py` | Schema + backfill |
| `backend/app/db/models/delivery.py` | Zone weather/pause; FKs on pricing, schedules, partnerships |
| `backend/app/modules/delivery_providers/schemas.py` | Zone CRUD + coverage DTOs; `zones` on me; partnership `zone` |
| `backend/app/modules/delivery_providers/matching.py` | Pure match selection over candidate rows |
| `backend/app/modules/delivery_providers/repository.py` | Zone/pricing/schedule/weather/pause/match signatures |
| `backend/app/modules/delivery_providers/adapters.py` | SQL implementation |
| `backend/app/modules/delivery_providers/service.py` | Zone CRUD; config endpoints take `zone_id` |
| `backend/app/modules/delivery_providers/partnerships.py` | Match-gated ensure; reassign; coverage preview |
| `backend/app/modules/delivery_providers/api.py` | Zone routes; `zone_id` query on config |
| `backend/app/modules/restaurants/api.py` | `GET /restaurants/mexy-coverage` before `/{id}` |
| `backend/app/modules/public/delivery_quote_service.py` | Quote against assigned zone |
| `backend/tests/api/test_delivery_provider_zones.py` | Zone CRUD + unique name + delete rules |
| `backend/tests/api/test_delivery_zone_matching.py` | Coverage + onboarding partnership |
| `backend/tests/api/test_delivery_partnerships.py` | Update always-create tests |
| `backend/tests/modules/test_public_delivery_quote_service.py` | Zone-scoped quote |
| `delivery-dashboard/src/lib/api/*` + `contexts/DeliveryZoneContext.tsx` | Zone client + selected zone |
| `delivery-dashboard/src/components/zones/ZoneSwitcher.tsx` | Chip bar |
| `delivery-dashboard` Cerco/Tarifas/Horarios/TopBar/Partnerships | Zone-scoped UI |
| `frontend/src/lib/api/restaurants.ts` + coverage card + settings | Onboarding preview + copy |

---

### Task 1: Migration and models

**Files:**
- Create: `backend/migrations/versions/0051_delivery_provider_multi_zone.py`
- Modify: `backend/app/db/models/delivery.py`

**Interfaces:**
- Consumes: current `0050_marketing_facebook_session_spike`
- Produces: `zone_id` on pricing/schedules/partnerships; `weather_mode` + `service_manually_enabled` on zones; unique name index; provider columns dropped after backfill

- [ ] **Step 1: Write the migration**

Create `backend/migrations/versions/0051_delivery_provider_multi_zone.py` with `revision = "0051_delivery_multi_zone"` and `down_revision = "0050_marketing_facebook_session_spike"`.

`upgrade()` must, in order:

1. Add `weather_mode` VARCHAR(16) NOT NULL DEFAULT `'none'` and `service_manually_enabled` BOOLEAN NOT NULL DEFAULT `true` to `delivery_provider_zones`. CheckConstraint `weather_mode IN ('none','light','heavy','intense')` named `ck_delivery_provider_zones_weather_mode_allowed`.
2. Add nullable `zone_id` UUID to `delivery_provider_pricing_configs`, `delivery_provider_schedules`, `restaurant_delivery_providers`.
3. Backfill SQL (run via `op.execute`):

```sql
-- primary zone per provider
WITH primary_zone AS (
  SELECT DISTINCT ON (delivery_provider_id) id, delivery_provider_id
  FROM delivery_provider_zones
  WHERE is_active = true
  ORDER BY delivery_provider_id, priority ASC, created_at ASC
)
UPDATE delivery_provider_zones z
SET weather_mode = p.weather_mode,
    service_manually_enabled = p.service_manually_enabled
FROM delivery_providers p
JOIN primary_zone pz ON pz.delivery_provider_id = p.id
WHERE z.id = pz.id;

UPDATE delivery_provider_pricing_configs c
SET zone_id = pz.id
FROM (
  SELECT DISTINCT ON (delivery_provider_id) id, delivery_provider_id
  FROM delivery_provider_zones
  WHERE is_active = true
  ORDER BY delivery_provider_id, priority ASC, created_at ASC
) pz
WHERE c.delivery_provider_id = pz.delivery_provider_id;

UPDATE delivery_provider_schedules s
SET zone_id = pz.id
FROM (
  SELECT DISTINCT ON (delivery_provider_id) id, delivery_provider_id
  FROM delivery_provider_zones
  WHERE is_active = true
  ORDER BY delivery_provider_id, priority ASC, created_at ASC
) pz
WHERE s.delivery_provider_id = pz.delivery_provider_id;

UPDATE restaurant_delivery_providers r
SET zone_id = pz.id
FROM (
  SELECT DISTINCT ON (delivery_provider_id) id, delivery_provider_id
  FROM delivery_provider_zones
  WHERE is_active = true
  ORDER BY delivery_provider_id, priority ASC, created_at ASC
) pz
WHERE r.delivery_provider_id = pz.delivery_provider_id;
```

4. Fail if any provider exists with zero zones: `SELECT 1 FROM delivery_providers p WHERE NOT EXISTS (SELECT 1 FROM delivery_provider_zones z WHERE z.delivery_provider_id = p.id)` — if any row, `raise RuntimeError("delivery provider missing zone")`.
5. Fail if any pricing/schedule/partnership row still has `zone_id IS NULL`.
6. Seed default pricing + default schedules for extra zones that have no pricing row (zones whose id is not in `pricing_configs.zone_id`). In the migration Python, call `config_to_json(default_pricing_config())` from `app.modules.delivery_providers.pricing` and insert 14 schedule rows per extra zone (7 regular `09:00–21:00`, 7 night `21:00–22:00`).
7. `ALTER COLUMN zone_id SET NOT NULL` on the three tables.
8. FK: pricing and schedules `ON DELETE CASCADE`; partnerships `ON DELETE RESTRICT`. Unique on `pricing_configs.zone_id`. Drop unique `uq_delivery_provider_pricing_configs_delivery_provider_id`.
9. Replace schedule lookup index with `(zone_id, schedule_kind, day_of_week)`.
10. Unique name:

```sql
CREATE UNIQUE INDEX uq_delivery_provider_zones_name_per_provider
ON delivery_provider_zones (delivery_provider_id, lower(btrim(name)));
```

11. Drop `delivery_providers.weather_mode` (and its check) and `delivery_providers.service_manually_enabled`.

`downgrade()`: reverse in opposite order; restore provider columns with defaults; move zone-0 weather/pause back to provider; drop `zone_id` columns and the unique name index.

- [ ] **Step 2: Update SQLAlchemy models**

In `DeliveryProviderZone` add:

```python
weather_mode: Mapped[str] = mapped_column(String, nullable=False, server_default="none")
service_manually_enabled: Mapped[bool] = mapped_column(
    Boolean, nullable=False, server_default="true"
)
```

Add the weather check to `__table_args__` (same values as the old provider check).

On `DeliveryProviderTariff` leave `zone_id` as-is (legacy unused table).

On `DeliveryProviderPricingConfig` add `zone_id` UUID FK unique; keep `delivery_provider_id`.

On `DeliveryProviderSchedule` add `zone_id` UUID FK.

On `RestaurantDeliveryProvider` add `zone_id` UUID FK `ondelete="RESTRICT"`.

Remove `weather_mode` and `service_manually_enabled` from `DeliveryProvider`.

Remove `service_manually_enabled=True` from `get_or_create_mexy_provider_id` provider constructor.

- [ ] **Step 3: Run existing onboarding test to see breakage**

Run: `cd backend && pytest tests/api/test_delivery_provider_onboarding.py::test_delivery_provider_onboarding_persists_provider_member_and_zone -v`

Expected: FAIL or error until Task 2 seeds `zone_id` on create (if create_onboarding still inserts schedules/pricing without `zone_id`, IntegrityError). That is acceptable; do not “fix” by making `zone_id` nullable.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/versions/0051_delivery_provider_multi_zone.py backend/app/db/models/delivery.py backend/app/modules/delivery_providers/adapters.py
git commit -m "feat(delivery): migrate pricing, hours, and pause onto zones"
```

---

### Task 2: Zone CRUD API

**Files:**
- Modify: `backend/app/modules/delivery_providers/schemas.py`
- Modify: `backend/app/modules/delivery_providers/repository.py`
- Modify: `backend/app/modules/delivery_providers/adapters.py`
- Modify: `backend/app/modules/delivery_providers/service.py`
- Modify: `backend/app/modules/delivery_providers/api.py`
- Create: `backend/tests/api/test_delivery_provider_zones.py`
- Modify: `backend/tests/api/test_delivery_provider_onboarding.py` (truncate extra tables; assert zone weather/pause; `/me` returns `zones`)

**Interfaces:**
- Consumes: Task 1 columns
- Produces:
  - `DeliveryProviderZoneWrite` with `name: str` (1–200), `polygon: GeoJsonPolygon`, optional `center_lat`/`center_lng`
  - `DeliveryProviderZoneDTO` keeps `id, name, polygon, center_lat, center_lng` and adds `weather_mode`, `service_manually_enabled`, `restaurant_count: int = 0`
  - `DeliveryProviderMeResponse.zones: list[DeliveryProviderZoneDTO]` (remove `primary_zone`)
  - `list_zones(provider_id) -> Sequence[DeliveryProviderZoneDTO]`
  - `create_zone(provider_id, *, name, geojson, center_lat, center_lng) -> DeliveryProviderZoneDTO`
  - `update_zone(...)` / `delete_zone(provider_id, zone_id) -> None`
  - `count_partnerships_for_zone(zone_id) -> int`
  - `count_zones(provider_id) -> int`
  - `seed_default_schedules(provider_id, zone_id)` / `seed_default_pricing_config(provider_id, zone_id)`

- [ ] **Step 1: Write failing API tests**

Create `backend/tests/api/test_delivery_provider_zones.py`. Reuse `ONBOARDING_PAYLOAD`, `SAMPLE_POLYGON`, `AUTH` from `test_delivery_provider_onboarding.py`. Truncate the same delivery tables plus `delivery_provider_pricing_configs`.

```python
@requires_db
def test_create_zone_rejects_duplicate_name_case_insensitive(client, engine):
    client.post("/api/v1/delivery-providers/onboarding", json=ONBOARDING_PAYLOAD, headers=AUTH)
    me = client.get("/api/v1/delivery-providers/me", headers=AUTH).json()
    assert len(me["zones"]) == 1
    north = {
        "name": "Centro",
        "polygon": SAMPLE_POLYGON,
        "center_lat": 19.436,
        "center_lng": -99.126,
    }
    # first extra zone
    resp = client.post("/api/v1/delivery-providers/me/zones", json=north, headers=AUTH)
    assert resp.status_code == 201
    dup = client.post(
        "/api/v1/delivery-providers/me/zones",
        json={**north, "name": "centro"},
        headers=AUTH,
    )
    assert dup.status_code == 409
    assert dup.json()["error"]["message"] == "Ya existe una zona con ese nombre"


@requires_db
def test_delete_last_zone_conflict(client):
    client.post("/api/v1/delivery-providers/onboarding", json=ONBOARDING_PAYLOAD, headers=AUTH)
    zones = client.get("/api/v1/delivery-providers/me/zones", headers=AUTH).json()
    assert len(zones) == 1
    resp = client.delete(f"/api/v1/delivery-providers/me/zones/{zones[0]['id']}", headers=AUTH)
    assert resp.status_code == 409
    assert resp.json()["error"]["message"] == "Debes conservar al menos una zona"
```

Also add `test_operator_cannot_create_zone` using the operator-role helper from `test_delivery_provider_operator_role.py`: POST 403 with `"Tu rol no permite modificar esta configuración"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/api/test_delivery_provider_zones.py -v`

Expected: FAIL with 404 on `/me/zones`.

- [ ] **Step 3: Implement CRUD**

Normalize name: `name.strip()`; empty → `ValidationError("El nombre de la zona es obligatorio")`. On unique violation from the index, raise `ConflictError("Ya existe una zona con ese nombre")`.

`create_zone`: insert polygon like current onboarding (`ST_SetSRID(ST_GeomFromGeoJSON)`), `weather_mode="none"`, `service_manually_enabled=True`, then `seed_default_pricing_config(provider_id, zone.id)` and `seed_default_schedules(provider_id, zone.id)`.

`delete_zone`: if `count_zones == 1` → `ConflictError("Debes conservar al menos una zona")`; if `n = count_partnerships > 0` → `ConflictError("Reasigna 1 negocio antes de eliminar esta zona" if n == 1 else f"Reasigna {n} negocios antes de eliminar esta zona")`.

Polygon validation: copy the ring-length checks from `submit_onboarding`.

Wire routes:

- `GET/POST /delivery-providers/me/zones`
- `GET/PATCH/DELETE /delivery-providers/me/zones/{zone_id}`

`get_me` returns `zones=list(self._repo.list_zones(provider.id))` and drops `primary_zone`.

`create_onboarding` / `update_profile`: after inserting/updating the zone, seed pricing/schedules **with that zone_id**. `PATCH /me` **stops** updating the polygon (remove `service_zone_*` from `DeliveryProviderProfileUpdate`). Onboarding POST still sends the first zone.

Update `seed_default_schedules` / `seed_default_pricing_config` / `set_schedules` to require `zone_id`. Existing callers in this task: onboarding + create_zone. Leave list/get pricing still provider-scoped until Task 3, but they must read by the primary zone if tests still call `/me/pricing` without query — **do not** keep a provider fallback. Task 3 adds `zone_id` query; for this task, point `/me/pricing` and `/me/schedules` at the oldest zone so onboarding tests that GET pricing still pass. Add a code comment `# Task 3: require zone_id query`.

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/api/test_delivery_provider_zones.py tests/api/test_delivery_provider_onboarding.py tests/api/test_delivery_provider_operator_role.py -v`

Expected: PASS (operator test new; existing onboarding `/me` assertions that use `primary_zone` must be updated to `zones[0]`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/delivery_providers backend/tests/api/test_delivery_provider_zones.py backend/tests/api/test_delivery_provider_onboarding.py
git commit -m "feat(delivery): add owner/admin zone CRUD with unique names"
```

---

### Task 3: Per-zone pricing, hours, weather, pause

**Files:**
- Modify: `backend/app/modules/delivery_providers/api.py` (Query `zone_id: UUID`)
- Modify: `backend/app/modules/delivery_providers/service.py`
- Modify: `backend/app/modules/delivery_providers/adapters.py`
- Modify: `backend/app/modules/delivery_providers/repository.py`
- Modify: `backend/tests/api/test_delivery_provider_onboarding.py` (pass `zone_id` on pricing/schedule calls)
- Modify: `backend/tests/api/test_delivery_provider_operator_role.py`

**Interfaces:**
- Consumes: `list_zones`, zone FKs
- Produces: `list_schedules(zone_id)`, `set_schedules(zone_id, ...)`, `get_pricing_config(zone_id)`, `set_pricing_config(zone_id, ...)`, `get_weather_mode(zone_id)`, `set_weather_mode(zone_id, mode)`, `get_service_manually_enabled(zone_id)`, `set_service_manually_enabled(zone_id, enabled)`
- `require_zone_owned(provider_id, zone_id)` → 404 `"Zona no encontrada"`
- Missing query → 400 `"Indica la zona"`
- Pause uses `require_manage_weather` (operator allowed), not `require_write_provider_config`

- [ ] **Step 1: Write failing tests**

In `test_delivery_provider_zones.py`:

```python
@requires_db
def test_pricing_requires_zone_id(client):
    client.post("/api/v1/delivery-providers/onboarding", json=ONBOARDING_PAYLOAD, headers=AUTH)
    resp = client.get("/api/v1/delivery-providers/me/pricing", headers=AUTH)
    assert resp.status_code == 400
    assert resp.json()["error"]["message"] == "Indica la zona"


@requires_db
def test_two_zones_have_independent_weather(client):
    client.post("/api/v1/delivery-providers/onboarding", json=ONBOARDING_PAYLOAD, headers=AUTH)
    zones = client.get("/api/v1/delivery-providers/me/zones", headers=AUTH).json()
    z0 = zones[0]["id"]
    created = client.post(
        "/api/v1/delivery-providers/me/zones",
        json={"name": "Norte", "polygon": SAMPLE_POLYGON, "center_lat": 19.44, "center_lng": -99.12},
        headers=AUTH,
    ).json()
    z1 = created["id"]
    client.patch(
        f"/api/v1/delivery-providers/me/pricing/weather-mode?zone_id={z1}",
        json={"weather_mode": "heavy"},
        headers=AUTH,
    )
    w0 = client.get(f"/api/v1/delivery-providers/me/pricing?zone_id={z0}", headers=AUTH).json()
    w1 = client.get(f"/api/v1/delivery-providers/me/pricing?zone_id={z1}", headers=AUTH).json()
    assert w0["weather_mode"] == "none"
    assert w1["weather_mode"] == "heavy"
```

Operator: PUT pricing 403; PATCH weather 200 (existing file, add `zone_id`).

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && pytest tests/api/test_delivery_provider_zones.py::test_pricing_requires_zone_id -v`

Expected: FAIL (currently 200 without query).

- [ ] **Step 3: Implement query param**

Helper on api routes:

```python
def _require_zone_id(zone_id: UUID | None = Query(default=None)) -> UUID:
    if zone_id is None:
        raise ValidationError("Indica la zona")
    return zone_id
```

Do not use FastAPI HTTPException; raise `ValidationError` so the existing error envelope is used. If `Query` + None never raises from FastAPI, check in the service instead.

Service methods take `zone_id`, call `self._repo.assert_zone_on_provider(provider_id, zone_id)`.

Remove leftover “primary zone” fallback from Task 2.

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/api/test_delivery_provider_zones.py tests/api/test_delivery_provider_onboarding.py tests/api/test_delivery_provider_operator_role.py -v`

Expected: PASS. Update every existing GET/PUT `/me/pricing` and `/me/schedules` and `/me/service-status` in tests to include `?zone_id=`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/delivery_providers backend/tests
git commit -m "feat(delivery): scope tariffs, hours, weather, and pause to a zone"
```

---

### Task 4: Mexy matching and gated partnerships

**Files:**
- Create: `backend/app/modules/delivery_providers/matching.py`
- Modify: repository, adapters, partnerships, restaurants API
- Create: `backend/tests/api/test_delivery_zone_matching.py`
- Modify: `backend/tests/api/test_delivery_partnerships.py`
- Modify: `backend/tests/modules/test_delivery_matching.py` (unit for tie-break)

**Interfaces:**
- Consumes: zone polygons + `outside_polygon.max_distance_km`
- Produces:
  - `MexyCoverageZoneDTO(id, name, provider_name)`
  - `MexyCoverageResponse(zone: MexyCoverageZoneDTO | None, distance_km: float | None)`
  - `match_mexy_zone(latitude: float, longitude: float) -> tuple[zone_dto, distance_km] | None`
  - `ensure_partnership_request(restaurant_id, provider_id, zone_id) -> bool`
  - `GET /restaurants/mexy-coverage?latitude=&longitude=` registered **before** `/{restaurant_id}`

Matching SQL (geography):

```sql
SELECT z.id, z.name, p.name AS provider_name, z.priority, z.created_at,
       ST_Distance(
         z.boundary,
         ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
       ) AS distance_m,
       (pc.outside_polygon->>'max_distance_km')::float AS max_km
FROM delivery_provider_zones z
JOIN delivery_providers p ON p.id = z.delivery_provider_id
JOIN delivery_provider_pricing_configs pc ON pc.zone_id = z.id
WHERE z.is_active = true
  AND z.boundary IS NOT NULL
  AND (p.slug = :legacy_slug OR p.slug LIKE :slug_prefix || '%')
```

Filter in Python: `distance_km = distance_m / 1000.0`; keep if `distance_km <= max_km`. Sort `(distance_km, priority, created_at)`.

`ensure_mexy_request_for_restaurant`: load restaurant lat/lng; if missing, return False; `match = match_mexy_zone(...)`; if None, return False; if partnership already exists, return False (do not change `zone_id`); else insert with `zone_id`.

**Stop calling `get_or_create_mexy_provider_id` from this path.** No covering zone ⇒ no Mexy row created.

`request_mexy_partnership`: if not `delivery_enabled`, keep current ValidationError; else ensure; return status (partnership may be null). HTTP 200.

- [ ] **Step 1: Write failing tests**

`backend/tests/modules/test_delivery_matching.py`:

```python
from app.modules.delivery_providers.matching import pick_nearest_zone

def test_pick_nearest_zone_prefers_smaller_distance():
    a = {"id": "a", "distance_km": 2.0, "priority": 0, "created_at": 1}
    b = {"id": "b", "distance_km": 1.0, "priority": 0, "created_at": 0}
    assert pick_nearest_zone([a, b])["id"] == "b"

def test_pick_nearest_zone_tie_uses_priority_then_created():
    a = {"id": "a", "distance_km": 1.0, "priority": 1, "created_at": 0}
    b = {"id": "b", "distance_km": 1.0, "priority": 0, "created_at": 9}
    assert pick_nearest_zone([a, b])["id"] == "b"
```

API: onboard Mexy with `SAMPLE_POLYGON` (covers 19.4326,-99.1332). Create restaurant at that point with `delivery_enabled=True` → partnership pending + `zone_id` of that zone. Create restaurant at `latitude=0, longitude=0` → 0 partnership rows. `GET /api/v1/restaurants/mexy-coverage?latitude=0&longitude=0` → `{zone: null, distance_km: null}`. Missing coords → 400 `"El negocio no tiene ubicación"`.

Two overlapping Mexy zones both covering the restaurant: coverage preview and the created partnership must use the zone with smaller `ST_Distance` (unit test above plus one API test that posts a second overlapping polygon and asserts the nearer `zone.id`).

Rewrite `test_onboarding_with_delivery_creates_mexy_partnership_request` to assert `link.zone_id is not None`.

Rewrite `test_request_partnership_creates_mexy_provider_when_missing`: without a Mexy zone, `POST .../delivery-partnership/request` returns `{partnership: null}` and does not create a provider-less-zone partnership. Rename the test to `test_request_partnership_without_coverage_returns_null`.

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && pytest tests/modules/test_delivery_matching.py tests/api/test_delivery_zone_matching.py -v`

Expected: FAIL import / 404.

- [ ] **Step 3: Implement matching + coverage route**

`pick_nearest_zone(rows: Sequence[dict]) -> dict | None` in `matching.py`.

Register coverage route immediately after `list_my_restaurants` in `restaurants/api.py`.

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/modules/test_delivery_matching.py tests/api/test_delivery_zone_matching.py tests/api/test_delivery_partnerships.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/delivery_providers/matching.py backend/app/modules/delivery_providers backend/app/modules/restaurants/api.py backend/tests
git commit -m "feat(delivery): match restaurants to the nearest in-range Mexy zone"
```

---

### Task 5: Public quote and partnership DTOs use assigned zone

**Files:**
- Modify: `backend/app/modules/delivery_providers/schemas.py` (`zone_id`, `zone_name` on `RestaurantDeliveryPartnershipDTO`; `zone: {id, name}` on `DeliveryPartnershipRequestDTO`)
- Modify: adapters `get_mexy_partnership_for_restaurant`, `_partnership_dto_from_row`
- Modify: `backend/app/modules/public/delivery_quote_service.py`
- Modify: repository `point_in_zone(zone_id, lat, lng)`, `list_schedules(zone_id)`, weather/pause by zone
- Modify: `backend/tests/modules/test_public_delivery_quote_service.py`
- Modify: partnerships `list_*` to accept optional `zone_id` filter; `PATCH` reassign
- Modify: `backend/app/modules/restaurants` partnership schedules endpoint to use assigned zone

**Interfaces:**
- Consumes: Task 3/4 zone-scoped repo methods
- Produces: quote inside/outside + night/weather against **partnership.zone_id**; `reassign_partnership_zone(link_id, provider_id, zone_id)`

- [ ] **Step 1: Write failing tests**

API test: two Mexy zones (onboarding zone + Norte with a disjoint polygon far away). Accept a restaurant in the first zone. Patch Norte weather to `intense`. Quote for that restaurant must still be available (weather none on its zone). Then set weather intense on the assigned zone; quote unavailable.

Reassign test: create two zones; restaurant pending on zone A; `PATCH /delivery-providers/me/partnerships/{id}` `{"zone_id": B}`; GET partnerships?zone_id=B includes it; DELETE zone A succeeds if no remaining links and it is not the last zone.

Existing unit test `test_public_delivery_quote_service.py` mocks `point_in_primary_zone` — rename mock to `point_in_zone` and pass `zone_id` on the partnership DTO. Tests must fail until the quote service is updated.

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && pytest tests/modules/test_public_delivery_quote_service.py tests/api/test_delivery_provider_zones.py -k reassign -v`

Expected: FAIL (missing zone fields / still calling primary zone).

- [ ] **Step 3: Implement quote + reassign**

`resolve_delivery_service`: load partnership; if `zone_id` is None, treat as no coverage; schedules/pause from that zone; timezone still from provider.

`quote_delivery`: `point_in_zone(partnership.zone_id, ...)`; `get_pricing_config(zone_id)`; `get_weather_mode(zone_id)`.

`PATCH /delivery-providers/me/partnerships/{link_id}` body `DeliveryPartnershipZoneUpdate(zone_id: UUID)`. `require_manage_partnerships`. Destination zone must belong to the same provider as the link.

List endpoints: `zone_id: UUID | None = Query(None)`.

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/modules/test_public_delivery_quote_service.py tests/api/test_delivery_partnerships.py tests/api/test_delivery_zone_matching.py tests/api/test_delivery_provider_zones.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules backend/tests
git commit -m "feat(delivery): quote and list restaurants by assigned zone"
```

---

### Task 6: delivery-dashboard API client and zone switcher

**Files:**
- Modify: `delivery-dashboard/src/lib/api/types.ts`
- Modify: `delivery-dashboard/src/lib/api/deliveryProviders.ts`
- Modify: `delivery-dashboard/src/lib/api/partnerships.ts`
- Create: `delivery-dashboard/src/contexts/DeliveryZoneContext.tsx`
- Create: `delivery-dashboard/src/components/zones/ZoneSwitcher.tsx`
- Create: `delivery-dashboard/src/components/zones/ZoneSwitcher.module.css`
- Modify: `delivery-dashboard/src/app/(panel)/layout.tsx` (wrap provider)
- Modify: `delivery-dashboard/src/lib/settings/providerProfile.ts` (stop sending `service_zone_*` on profile PATCH)

**Interfaces:**
- Consumes: Task 2–5 JSON
- Produces: `listMyZones`, `createZone`, `updateZone`, `deleteZone`; all pricing/schedule/status calls take `zoneId: string`; `DeliveryZoneProvider` reads `localStorage` key `delivery.selectedZoneId`

No Jest in this app — verify by typecheck.

- [ ] **Step 1: Update types**

```ts
export type DeliveryProviderMeResponse = {
  provider: DeliveryProvider | null;
  member_role: string | null;
  zones: DeliveryProviderZone[];
};

export type DeliveryProviderZone = {
  id: string;
  name: string;
  polygon: GeoJsonPolygon | null;
  center_lat: number | null;
  center_lng: number | null;
  weather_mode: DeliveryWeatherMode;
  service_manually_enabled: boolean;
  restaurant_count: number;
};

export type DeliveryProviderProfileUpdate = {
  company_name: string;
  responsible_name: string;
  responsible_phone: string;
  whatsapp_phone: string;
  logo_base64: string | null;
  logo_file_name: string | null;
};
```

Add `zone: { id: string; name: string }` to `DeliveryPartnershipRequest`.

- [ ] **Step 2: API helpers**

Append `?zone_id=${encodeURIComponent(zoneId)}` on schedules, pricing, weather, simulate, service-status.

```ts
export function listMyDeliveryProviderZones(token: string) {
  return apiRequest<DeliveryProviderZone[]>('/delivery-providers/me/zones', { token });
}
```

`createMyDeliveryProviderZone`, `patch`, `delete` accordingly.

`reassignPartnershipZone(token, linkId, zoneId)` → PATCH `/delivery-providers/me/partnerships/${linkId}`.

- [ ] **Step 3: Zone context + switcher**

`DeliveryZoneProvider`: load zones from `/me` or `/me/zones`. Selected id from localStorage if still present, else first zone. `canWriteProviderConfig` gates “Agregar zona”.

`ZoneSwitcher`: horizontal chips (`role="tablist"`), selected chip uses primary color, `cursor-pointer`, `transition-colors` 200ms. “Agregar zona” button with MUI `AddOutlined` (not emoji). Persist selection on click.

Wrap panel layout with the provider next to `DeliveryProviderAccessProvider`.

- [ ] **Step 4: Typecheck**

Run: `cd delivery-dashboard && pnpm exec tsc --noEmit`

Expected: errors in pages still using `primary_zone` and profile zone fields — fix those call sites in Tasks 7–8; for this task, temporarily keep compiling by updating `providerProfileFromApi` to `zones[0]` so tsc passes, then Task 7 replaces Cerco.

- [ ] **Step 5: Commit**

```bash
git add delivery-dashboard/src
git commit -m "feat(delivery-dashboard): add zone API client and switcher"
```

---

### Task 7: Cerco, tarifas, horarios, top-bar pause

**Files:**
- Modify: `delivery-dashboard/src/components/pages/ServiceZonePage.tsx`
- Modify: `delivery-dashboard/src/components/pages/TariffsPage.tsx`
- Modify: `delivery-dashboard/src/components/pages/SchedulesPage.tsx`
- Modify: `delivery-dashboard/src/hooks/useServiceStatus.ts`
- Modify: `delivery-dashboard/src/components/ui/ServiceStatusToggle.tsx`
- Modify: `delivery-dashboard/src/components/ui/TopBar.tsx` / `TopBar.module.css`

**Interfaces:**
- Consumes: `useDeliveryZone()` → `{ zones, selectedZoneId, setSelectedZoneId, refreshZones }`
- Produces: all four screens operate on `selectedZoneId`; create/delete zone on Cerco; operator read-only except weather + pause

- [ ] **Step 1: Cerco page**

Render `ZoneSwitcher` under `PanelPageShell` title. Load polygon via `GET /me/zones/{id}` or from list DTO. Save via `PATCH /me/zones/{id}` (name + polygon), **not** `PATCH /me`.

Delete button (owner/admin): confirm dialog. If `restaurant_count > 0`, disable and show the API message pattern (`Reasigna N negocios…`). Last zone: hide delete or let API 409 surface in the error banner.

Create: modal/panel with name input + `ServiceZoneMapDrawer`; POST then `setSelectedZoneId(newId)` and `refreshZones()`.

- [ ] **Step 2: Tariffs + schedules**

Pass `selectedZoneId` into get/update/simulate/weather. Reload when `selectedZoneId` changes. Weather control stays on Tariffs, scoped to that zone.

- [ ] **Step 3: Pause toggle**

`useServiceStatus(zoneId)` includes `zoneId` in GET/PATCH query. Top bar: native `<select>` of zone names (compact, labeled `Zona`) then the existing switch. Dot color from that zone’s `service_active`. Operator can toggle pause.

- [ ] **Step 4: Typecheck**

Run: `cd delivery-dashboard && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add delivery-dashboard/src
git commit -m "feat(delivery-dashboard): edit fence, tariffs, hours, and pause per zone"
```

---

### Task 8: Courier restaurant list by zone

**Files:**
- Modify: `delivery-dashboard/src/components/pages/PartnershipsPage.tsx`
- Modify: `delivery-dashboard/src/components/pages/PartnershipsPage.module.css`
- Modify: `delivery-dashboard/src/components/partnerships/PartnershipRequestCard.tsx`
- Modify: `delivery-dashboard/src/components/partnerships/ActivePartnershipCard.tsx`
- Modify: `delivery-dashboard/src/lib/api/partnerships.ts` (optional `zoneId` query)

**Interfaces:**
- Consumes: `zone` on each request DTO; `reassignPartnershipZone`
- Produces: filter chips `Todas` + each zone; group headers; empty “Nadie en esta zona todavía”

- [ ] **Step 1: Filter + group**

Client can filter locally from the full list (simpler) using `request.zone.id`. Show a chip row above tabs. Group with `<h3 className={styles.zoneHeading}>{name}</h3>`.

Cards show a muted chip with zone name.

Empty state when the filter has zero rows: title `Nadie en esta zona todavía`, subtitle `Las solicitudes de esta zona aparecerán aquí.`

- [ ] **Step 2: Reassign (owner/admin/operator)**

On active cards, a `<select>` of zones; on change call PATCH; keep the row in the new group. Do not add reassign on pending unless it is one extra select — spec allows reassign of the link; include it on both pending and active so a zone can be emptied before delete.

- [ ] **Step 3: Typecheck**

Run: `cd delivery-dashboard && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add delivery-dashboard/src
git commit -m "feat(delivery-dashboard): group restaurant partnerships by zone"
```

---

### Task 9: Restaurant onboarding coverage card

**Files:**
- Modify: `frontend/src/lib/api/types.ts`
- Modify: `frontend/src/lib/api/restaurants.ts`
- Create: `frontend/src/lib/deliveryCoverageCopy.ts`
- Create: `frontend/src/lib/deliveryCoverageCopy.test.ts`
- Create: `frontend/src/components/onboarding/DeliveryCoverageCard.tsx`
- Create: `frontend/src/components/onboarding/DeliveryCoverageCard.module.css`
- Modify: `frontend/src/components/onboarding/OnboardingWizard.tsx`

**Interfaces:**
- Consumes: `GET /restaurants/mexy-coverage`
- Produces: `getMexyCoverage(token, lat, lng)`; card for match / empty for no match; no zone picker

- [ ] **Step 1: Write failing copy tests**

```ts
import { describe, expect, it } from 'vitest';
import { coverageCardCopy } from './deliveryCoverageCopy';

describe('coverageCardCopy', () => {
  it('names the matched zone', () => {
    const copy = coverageCardCopy({
      zone: { id: '1', name: 'Centro', provider_name: 'Mexy Reparto' },
      distance_km: 0.4,
    });
    expect(copy.title).toBe('Mexy Reparto · Centro');
    expect(copy.body).toBe(
      'Tu negocio está en esta zona. Al terminar, enviaremos la solicitud de reparto.',
    );
  });

  it('explains missing coverage', () => {
    const copy = coverageCardCopy({ zone: null, distance_km: null });
    expect(copy.title).toBe('Aún no hay cobertura de Mexy en tu ubicación');
    expect(copy.body).toBe(
      'Puedes activar entrega a domicilio y solicitar reparto cuando haya una zona cerca.',
    );
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && pnpm exec vitest run src/lib/deliveryCoverageCopy.test.ts`

Expected: FAIL module not found.

- [ ] **Step 3: Implement helper, API, card, wizard**

`getMexyCoverage`:

```ts
export function getMexyCoverage(token: string, latitude: number, longitude: number) {
  const q = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
  return apiRequest<MexyCoverageResponse>(`/restaurants/mexy-coverage?${q}`, { token });
}
```

In `orderTypes` step: if lat/lng present, fetch coverage (abort on unmount). Show `DeliveryCoverageCard` under the delivery switch. If coords missing, show the no-coverage copy.

Icons: MUI `LocalShippingOutlined` / `PlaceOutlined`, not emoji. Card uses existing onboarding tokens (`--color-surface`, `--color-border`, `--radius`).

- [ ] **Step 4: Run tests**

Run: `cd frontend && pnpm exec vitest run src/lib/deliveryCoverageCopy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(onboarding): show nearest Mexy zone coverage on delivery step"
```

---

### Task 10: Restaurant settings copy and partnership types

**Files:**
- Modify: `frontend/src/lib/api/types.ts` (`zone_id`, `zone_name` on `RestaurantDeliveryPartnership`)
- Modify: `frontend/src/components/settings/DeliveryPartnershipStatus.tsx`
- Modify: `frontend/src/lib/deliveryPartnership.ts` (optional hint when zone present)
- Modify: `frontend/src/lib/syncDeliveryPartnership.ts` (already fine: request may return null)

**Interfaces:**
- Consumes: partnership DTO with zone
- Produces: title `Mexy Reparto · {zone_name}` when zone_name set; when `deliveryEnabled && partnership === null`, empty title `Sin cobertura de Mexy` and body `Aún no hay una zona de Mexy que cubra tu ubicación. Puedes mantener delivery activo y volver a intentar más tarde.`

- [ ] **Step 1: Update status component**

Replace the old “Solicitud pendiente de envío” branch: that copy is wrong when coverage is missing. Use the sin-cobertura copy when `partnership === null` and `requestError` is null. Keep the requestError branch.

Provider heading: `[partnership.provider_name, partnership.zone_name].filter(Boolean).join(' · ')`.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Regression pytest**

Run: `cd backend && pytest tests/api/test_delivery_provider_zones.py tests/api/test_delivery_zone_matching.py tests/api/test_delivery_partnerships.py tests/api/test_delivery_provider_onboarding.py tests/api/test_delivery_provider_operator_role.py tests/modules/test_public_delivery_quote_service.py tests/modules/test_delivery_matching.py -v`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "feat(settings): show Mexy zone name or lack of coverage"
```

---

## Manual verification

1. Existing Mexy restaurant: menu public quote still works after migrate.
2. Owner creates zone “Norte”, draws polygon, sets distinct night fee; pause Norte; Centro still quotes.
3. Onboarding with pin inside Centro → card Centro → submit → pending in Centro list.
4. Onboarding with pin outside all max-km → no request; settings shows sin cobertura.
5. Operator cannot create zone; can accept request and switch weather.
6. Delete zone with restaurants → 409; reassign → delete OK; cannot delete last zone.

## Spec coverage

| Spec section | Task |
|---|---|
| 4 schema/backfill | 1 |
| 7.1 zone CRUD, unique name, last zone | 2 |
| 7.2 zone_id on config, operator 403 | 3 |
| 5–6.2 matching + gated ensure + coverage GET | 4 |
| 6.3–6.4 quote, lists, reassign | 5 |
| 9.1 switcher/client | 6 |
| 9.1 cerco/tarifas/horarios/pause | 7 |
| 9.1 restaurantes | 8 |
| 6.1 / 9.2 onboarding | 9 |
| 9.3 settings | 10 |
| 10 tests | 1–5, 9–10 |
| 11 out of scope | not implemented |

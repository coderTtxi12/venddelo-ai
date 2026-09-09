# Partnership On Hold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Mexy pause a restaurant courier from `/partnerships` (`on_hold`) so new delivery requests stop, `/delivery` shows a WhatsApp notice, and the public digital menu silently omits delivery until Mexy unholds.

**Architecture:** Keep `restaurant_delivery_providers.status = 'active'` and add `on_hold`. `PublicDeliveryQuoteService` returns `available=False` + `on_hold=True`. Dispatch create rejects new requests. Mexy PATCH toggles the flag. Restaurant UI branches on `on_hold`; public checkout omits delivery from offered services without rendering the reason.

**Tech Stack:** FastAPI/SQLAlchemy/Alembic, Next.js restaurant panel + delivery-dashboard (CSS modules, MUI icons), public live menu checkout helpers, `node --import tsx --test`, pytest.

**Spec:** `docs/superpowers/specs/2026-09-09-partnership-on-hold-design.md`

## Global Constraints

- Work on the **current git branch**. Do not create another branch.
- **Do not commit** and do not `git push`.
- Do not set `restaurants.delivery_enabled` to false.
- Do not reuse partnership `status='suspended'`.
- Public digital menu: **no hold/payment copy**. Delivery option absent only.
- WhatsApp CTA (restaurant panel only): `https://wa.me/525574277066`, display `55 7427 7066`.
- Restaurant notice title: `Mexy pausó las entregas de tu negocio`
- Restaurant notice detail: `Escríbenos por WhatsApp para reactivarlas. Los envíos que ya están en camino siguen.`
- API/validation reason (no phone number): `Mexy pausó las entregas de tu negocio. Escríbenos por WhatsApp para reactivarlas.`
- In-flight dispatch continues; only **new** `DeliveryDispatchRequest` creates are blocked.
- Mexy toggle: `require_manage_partnerships` (owner/admin/operator).
- Unhold restores service with no restaurant reconfiguration.
- Skip every “Commit” step in this plan.

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/migrations/versions/0077_partnership_on_hold.py` | `on_hold` column |
| `backend/app/db/models/delivery.py` | `RestaurantDeliveryProvider.on_hold` |
| `backend/app/modules/delivery_providers/schemas.py` | DTO + PATCH field |
| `backend/app/modules/public/schemas.py` | `PublicDeliveryServiceDTO.on_hold` |
| `backend/app/modules/public/delivery_quote_service.py` | Hold gate |
| `backend/app/modules/delivery_providers/adapters.py` | Filter, PATCH, DTO mapping |
| `backend/app/modules/delivery_providers/partnerships.py` | List/PATCH + realtime notify |
| `backend/app/modules/delivery_providers/api.py` | Query + PATCH wiring |
| `backend/app/modules/delivery_providers/repository.py` | Protocol signatures |
| `backend/app/modules/delivery_dispatch/service.py` | Reject create on hold |
| `backend/app/modules/public/api.py` | Map `on_hold` on checkout-config |
| `delivery-dashboard/src/lib/api/partnershipQuery.ts` | `onHold` query param |
| `delivery-dashboard/src/components/partnerships/HoldStatus.tsx` | Hold/unhold control |
| `delivery-dashboard/src/components/pages/PartnershipsPage.tsx` | Filter + confirm |
| `frontend/src/lib/dispatch/mexyOnHold.ts` | Copy + wa.me helper |
| `frontend/src/components/dispatch/MexyOnHoldNotice.tsx` | Restaurant alert + CTA |
| `frontend/src/lib/digital-menu/checkout/fulfillment.ts` | Omit delivery when `on_hold` |
| `frontend/src/components/pages/PublicDigitalMenuPage.tsx` | Chips from checkout-config |

---

### Task 1: Column, model, DTOs

**Files:**
- Create: `backend/migrations/versions/0077_partnership_on_hold.py`
- Modify: `backend/app/db/models/delivery.py` (`RestaurantDeliveryProvider`, after `has_web_app`)
- Modify: `backend/app/modules/delivery_providers/schemas.py`
- Modify: `backend/app/modules/public/schemas.py`
- Modify: `backend/app/modules/public/delivery_quote_service.py` (`ResolvedDeliveryService`)
- Test: `backend/tests/modules/test_public_delivery_quote_service.py`

**Interfaces:**
- Consumes: Alembic head `0076_partnership_web_app`
- Produces: `RestaurantDeliveryProvider.on_hold: bool` default False; DTOs `on_hold: bool = False`; `ResolvedDeliveryService.on_hold: bool = False`

- [ ] **Step 1: Write the failing test**

Add at the bottom of `backend/tests/modules/test_public_delivery_quote_service.py`:

```python
def test_resolve_delivery_service_blocks_active_partnership_on_hold():
    repo = MagicMock()
    partnership = RestaurantDeliveryPartnershipDTO(
        id=uuid.uuid4(),
        provider_name="Mexy",
        provider_slug="mexy",
        zone_id=uuid.uuid4(),
        status="active",
        is_default=True,
        created_at=datetime.now(),
        activated_at=datetime.now(),
        on_hold=True,
    )
    repo.get_mexy_partnership_for_restaurant.return_value = partnership
    repo.get_mexy_provider_id.return_value = uuid.uuid4()

    resolved = PublicDeliveryQuoteService(repo).resolve_delivery_service(_restaurant())

    assert resolved.available is False
    assert resolved.on_hold is True
    assert resolved.partnership_status == "active"
    assert "whatsapp" in (resolved.reason or "").lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/modules/test_public_delivery_quote_service.py::test_resolve_delivery_service_blocks_active_partnership_on_hold -q`

Expected: FAIL (`on_hold` unexpected / `available` still True).

- [ ] **Step 3: Write minimal schema + DTO fields**

Migration `0077_partnership_on_hold.py`, `down_revision = "0076_partnership_web_app"`:

```python
op.add_column(
    "restaurant_delivery_providers",
    sa.Column("on_hold", sa.Boolean(), nullable=False, server_default=sa.text("false")),
)
```

Model:

```python
on_hold: Mapped[bool] = mapped_column(
    Boolean, nullable=False, default=False, server_default="false"
)
```

Add `on_hold: bool = False` to `DeliveryPartnershipRequestDTO`, `DeliveryPartnershipUpdate` (`bool | None = None`), `RestaurantDeliveryPartnershipDTO`, `PublicDeliveryServiceDTO`, and `ResolvedDeliveryService`.

- [ ] **Step 4: Run the new test — still fail on behavior**

Same pytest command. Expected: FAIL on `available is False` until Task 2. If it already errors only on missing field, DTO work is done.

- [ ] **Step 5: Do not commit**

---

### Task 2: Quote service hold gate

**Files:**
- Modify: `backend/app/modules/public/delivery_quote_service.py`
- Modify: `backend/app/modules/public/api.py` (checkout-config mapping)
- Test: `backend/tests/modules/test_public_delivery_quote_service.py`

**Interfaces:**
- Consumes: `RestaurantDeliveryPartnershipDTO.on_hold`
- Produces: `MEXY_ON_HOLD_REASON`; `resolve_delivery_service` early-return when `status=='active'` and `on_hold`

- [ ] **Step 1: Extend the failing test** so `quote_delivery` is also unavailable:

```python
def test_quote_delivery_unavailable_when_partnership_on_hold():
    repo = MagicMock()
    partnership = RestaurantDeliveryPartnershipDTO(
        id=uuid.uuid4(),
        provider_name="Mexy",
        provider_slug="mexy",
        zone_id=uuid.uuid4(),
        status="active",
        is_default=True,
        created_at=datetime.now(),
        activated_at=datetime.now(),
        on_hold=True,
    )
    repo.get_mexy_partnership_for_restaurant.return_value = partnership
    quote = PublicDeliveryQuoteService(repo).quote_delivery(
        _restaurant(),
        delivery_latitude=19.45,
        delivery_longitude=-99.12,
    )
    assert quote.available is False
```

- [ ] **Step 2: Run tests — expect FAIL**

`cd backend && .venv/bin/pytest tests/modules/test_public_delivery_quote_service.py::test_resolve_delivery_service_blocks_active_partnership_on_hold tests/modules/test_public_delivery_quote_service.py::test_quote_delivery_unavailable_when_partnership_on_hold -q`

- [ ] **Step 3: Implement the gate**

In `delivery_quote_service.py`:

```python
MEXY_ON_HOLD_REASON = (
    "Mexy pausó las entregas de tu negocio. "
    "Escríbenos por WhatsApp para reactivarlas."
)
```

In `resolve_delivery_service`, after `status != "active" or partnership is None` block and **before** schedule/weather:

```python
if partnership.on_hold:
    return ResolvedDeliveryService(
        available=False,
        reason=MEXY_ON_HOLD_REASON,
        partnership_status="active",
        provider_name=partnership.provider_name,
        provider_id=self._repo.get_mexy_provider_id(),
        on_hold=True,
    )
```

`quote_delivery` already returns unavailable when `not service.available`.

In `backend/app/modules/public/api.py` `get_public_checkout_config`, pass `on_hold=resolved.on_hold` into `PublicDeliveryServiceDTO(...)`.

- [ ] **Step 4: Run quote tests**

`cd backend && .venv/bin/pytest tests/modules/test_public_delivery_quote_service.py -q`

Expected: PASS (existing weather/schedule tests unchanged).

- [ ] **Step 5: Do not commit**

---

### Task 3: PATCH, list filter, notify

**Files:**
- Modify: `backend/app/modules/delivery_providers/repository.py`
- Modify: `backend/app/modules/delivery_providers/adapters.py`
- Modify: `backend/app/modules/delivery_providers/partnerships.py`
- Modify: `backend/app/modules/delivery_providers/api.py`
- Test: `backend/tests/api/test_delivery_partnerships.py`

**Interfaces:**
- Consumes: `DeliveryPartnershipUpdate.on_hold`
- Produces: `list_partnerships_page(..., on_hold: bool | None = None)`; `update_partnership(..., on_hold: bool | None = None)`; notify `delivery.service.updated`

- [ ] **Step 1: Write the failing API test** (needs Postgres `vendelo_test`)

Append to `backend/tests/api/test_delivery_partnerships.py` after the web-app tests:

```python
@requires_db
def test_patch_on_hold_filters_active_list(client):
    _create_mexy_provider(client)
    restaurant_id = _create_covered_restaurant(
        client, name="Hold Bistro", subdomain="hold-bistro"
    )
    _use_mexy_auth()
    listed = client.get("/api/v1/delivery-providers/me/partnership-requests", headers=AUTH)
    item = next(
        row for row in partnership_items(listed) if row["restaurant"]["id"] == restaurant_id
    )
    accepted = client.post(
        f"/api/v1/delivery-providers/me/partnership-requests/{item['id']}/accept",
        headers=AUTH,
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["on_hold"] is False

    held = client.patch(
        f"/api/v1/delivery-providers/me/partnerships/{item['id']}",
        json={"on_hold": True},
        headers=AUTH,
    )
    assert held.status_code == 200, held.text
    assert held.json()["on_hold"] is True
    assert held.json()["status"] == "active"

    filtered = client.get(
        "/api/v1/delivery-providers/me/partnerships?on_hold=true",
        headers=AUTH,
    )
    assert filtered.status_code == 200
    ids = {row["id"] for row in partnership_items(filtered)}
    assert item["id"] in ids

    released = client.patch(
        f"/api/v1/delivery-providers/me/partnerships/{item['id']}",
        json={"on_hold": False},
        headers=AUTH,
    )
    assert released.json()["on_hold"] is False
```

- [ ] **Step 2: Run test — expect FAIL** (`on_hold` missing / 422)

`cd backend && .venv/bin/pytest tests/api/test_delivery_partnerships.py::test_patch_on_hold_filters_active_list -q`

If Postgres is down, skip with reason printed; implement anyway and re-run later.

- [ ] **Step 3: Implement**

Thread `on_hold` like `has_web_app` through `list_*_requests`, `_list_page`, `list_partnerships_page` (`query.where(RestaurantDeliveryProvider.on_hold.is_(on_hold))`), GET query param, and `update_partnership`.

Change empty PATCH guard to:

```python
if zone_id is None and has_web_app is None and on_hold is None:
    raise ValidationError("Nada que actualizar")
```

Map `on_hold=bool(link.on_hold)` in `_partnership_dto_from_row` and `get_mexy_partnership_for_restaurant`.

In `DeliveryPartnershipService.update_partnership`, after repo update:

```python
from app.infra.realtime.restaurant_dispatch_hub import notify_restaurants_delivery_service_updated

result = self._repo.update_partnership(...)
if on_hold is not None:
    notify_restaurants_delivery_service_updated([result.restaurant.id])
return result
```

- [ ] **Step 4: Re-run partnership tests**

`cd backend && .venv/bin/pytest tests/api/test_delivery_partnerships.py -q`

Expected: PASS when DB is up.

- [ ] **Step 5: Do not commit**

---

### Task 4: Block new dispatch creates

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/service.py` (`create`, after `_active_partnership`)
- Test: `backend/tests/api/test_restaurant_dispatch_requests.py`

**Interfaces:**
- Consumes: `RestaurantDeliveryProvider.on_hold`; `MEXY_ON_HOLD_REASON`
- Produces: `ValidationError(MEXY_ON_HOLD_REASON)` on create; list/cancel/progress unchanged

- [ ] **Step 1: Write the failing test**

```python
@requires_db
def test_create_dispatch_rejected_when_partnership_on_hold(client, engine):
    from tests.api.test_api_v1 import FakeAuth
    from tests.api.test_delivery_partnerships import _use_mexy_auth, _use_owner_auth

    _create_mexy_provider(client)
    restaurant_id = _create_restaurant(client, subdomain="dispatch-on-hold")
    _activate_partnership(client, engine, restaurant_id)

    _use_mexy_auth()
    listed = client.get("/api/v1/delivery-providers/me/partnerships", headers=AUTH)
    link_id = next(
        item["id"]
        for item in partnership_items(listed)
        if item["restaurant"]["id"] == restaurant_id
    )
    held = client.patch(
        f"/api/v1/delivery-providers/me/partnerships/{link_id}",
        json={"on_hold": True},
        headers=AUTH,
    )
    assert held.status_code == 200, held.text

    _use_owner_auth()
    response = client.post(
        "/api/v1/restaurants/me/dispatch-requests",
        params={"restaurant_id": restaurant_id},
        json=_dispatch_payload(),
        headers=AUTH,
    )
    assert response.status_code == 400
    assert "WhatsApp" in response.json()["error"]["message"]
```

`_use_owner_auth` lives in `tests.api.test_delivery_partnerships`. Import it; after Mexy PATCH, call `_use_owner_auth()` before the restaurant POST.

- [ ] **Step 2: Run test — expect FAIL** (201 instead of 400)

- [ ] **Step 3: Implement**

```python
from app.modules.public.delivery_quote_service import MEXY_ON_HOLD_REASON

partnership = self._active_partnership(restaurant.id)
if partnership.on_hold:
    raise ValidationError(MEXY_ON_HOLD_REASON)
```

- [ ] **Step 4: Run**

`cd backend && .venv/bin/pytest tests/api/test_restaurant_dispatch_requests.py::test_create_dispatch_rejected_when_partnership_on_hold tests/api/test_restaurant_dispatch_requests.py::test_create_dispatch_persists_quote_and_immediate_search -q`

Expected: create-on-hold FAIL→PASS; existing create still 201.

- [ ] **Step 5: Do not commit**

---

### Task 5: Delivery dashboard `/partnerships`

**Files:**
- Modify: `delivery-dashboard/src/lib/api/types.ts` (`on_hold` on `DeliveryPartnershipRequest`)
- Modify: `delivery-dashboard/src/lib/api/partnershipQuery.ts`
- Modify: `delivery-dashboard/src/lib/api/partnershipQuery.test.ts`
- Modify: `delivery-dashboard/src/lib/api/partnerships.ts` (`updatePartnership` body)
- Create: `delivery-dashboard/src/components/partnerships/HoldStatus.tsx`
- Create: `delivery-dashboard/src/components/partnerships/HoldStatus.module.css`
- Modify: `delivery-dashboard/src/components/partnerships/ActivePartnershipCard.tsx` + `.module.css`
- Modify: `delivery-dashboard/src/components/pages/PartnershipsPage.tsx`

**Interfaces:**
- Consumes: PATCH `{ on_hold: boolean }`; list `on_hold=true|false`
- Produces: badge **En hold**; confirm-before-hold; filter Todas / En hold / Sin hold

- [ ] **Step 1: Write the failing query test**

In `partnershipQuery.test.ts`:

```javascript
test('partnershipListPath sends on_hold filter', () => {
  assert.equal(
    partnershipListPath('active', { onHold: true, limit: 20, offset: 0 }),
    '/delivery-providers/me/partnerships?on_hold=true&limit=20&offset=0',
  );
});
```

- [ ] **Step 2: Run**

`cd delivery-dashboard && ../frontend/node_modules/.bin/tsx --test src/lib/api/partnershipQuery.test.ts`

Expected: FAIL until `onHold` is wired.

- [ ] **Step 3: Implement client + UI**

Add `onHold?: boolean | null` to `PartnershipListQuery` and `params.set('on_hold', String(query.onHold))` when not null.

`HoldStatus`: MUI `PauseCircleOutlined` / `PlayArrowOutlined`; `aria-pressed={onHold}`; label `En hold` / `Activo`. If `canEdit` and turning **on**, caller confirms; unhold calls `onChange(false)` immediately.

`ActivePartnershipCard`: when `partnership.on_hold`, replace green `Activo` chip with amber **En hold** chip (text + color). Render `HoldStatus` next to `WebAppStatus`.

`PartnershipsPage`: state `onHold: boolean | null`; second chip group `aria-label="Filtrar por hold"`; `ConfirmDialog` title `Poner en hold` body `Se pausan pedidos nuevos de delivery. Los envíos en camino siguen. El menú digital deja de ofrecer entrega hasta que reactives.`; confirm label `Poner en hold`.

Follow existing card/chip CSS tokens (amber like monitor `.warnChip`: `#a16207` / `#f59e0b`).

- [ ] **Step 4: Re-run query tests**

Same tsx command. Expected: PASS.

- [ ] **Step 5: Do not commit**

---

### Task 6: Restaurant `/delivery` + kitchen drawer

**Files:**
- Create: `frontend/src/lib/dispatch/mexyOnHold.ts`
- Create: `frontend/src/lib/dispatch/mexyOnHold.test.ts`
- Create: `frontend/src/components/dispatch/MexyOnHoldNotice.tsx`
- Create: `frontend/src/components/dispatch/MexyOnHoldNotice.module.css`
- Modify: `frontend/src/lib/api/public.ts` (`on_hold?: boolean`)
- Modify: `frontend/src/lib/courierUnavailableCopy.ts`
- Modify: `frontend/src/components/pages/DeliveryPage.tsx`
- Modify: `frontend/src/components/dispatch/OrderDispatchDrawer.tsx`

**Interfaces:**
- Consumes: `PublicDeliveryService.on_hold`
- Produces: `mexyOnHoldWhatsAppUrl()` → `https://wa.me/525574277066`; notice with `role="alert"`

- [ ] **Step 1: Write failing copy tests**

`frontend/src/lib/dispatch/mexyOnHold.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MEXY_ON_HOLD_DETAIL,
  MEXY_ON_HOLD_TITLE,
  mexyOnHoldWhatsAppUrl,
} from './mexyOnHold';

test('mexyOnHoldWhatsAppUrl uses Mexico country code', () => {
  assert.equal(mexyOnHoldWhatsAppUrl(), 'https://wa.me/525574277066');
});

test('hold copy does not mention billing or weekly fee', () => {
  const blob = `${MEXY_ON_HOLD_TITLE} ${MEXY_ON_HOLD_DETAIL}`.toLowerCase();
  assert.equal(blob.includes('seman'), false);
  assert.equal(blob.includes('pago'), false);
});
```

Also in `courierUnavailableCopy` tests if they exist: `restaurantCourierServiceNotice({ available: false, reason: '...', weather_mode: 'none', on_hold: true })` returns `null`.

- [ ] **Step 2: Run**

`cd frontend && node --import tsx --test src/lib/dispatch/mexyOnHold.test.ts`

Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
export const MEXY_ON_HOLD_TITLE = 'Mexy pausó las entregas de tu negocio';
export const MEXY_ON_HOLD_DETAIL =
  'Escríbenos por WhatsApp para reactivarlas. Los envíos que ya están en camino siguen.';
export const MEXY_ON_HOLD_WHATSAPP_DISPLAY = '55 7427 7066';

export function mexyOnHoldWhatsAppUrl(): string {
  return 'https://wa.me/525574277066';
}

export function isMexyPartnershipOnHold(
  service: { on_hold?: boolean } | null | undefined,
): boolean {
  return service?.on_hold === true;
}
```

`MexyOnHoldNotice`: heading `tabIndex={-1}`, `role="alert"`, MUI pause icon, WhatsApp link `target="_blank" rel="noopener noreferrer"`, label `Escribir a Mexy` + visible number. Style like `CourierUnavailableAlert` blocked/amber.

`restaurantCourierServiceNotice`: if `service.on_hold` return `null`.

`DeliveryPage`: if `isMexyPartnershipOnHold(deliveryService)`, render `MexyOnHoldNotice` instead of `CourierUnavailableAlert` and instead of `RequestDeliveryForm`. Keep `DispatchRecentRequests`.

`OrderDispatchDrawer`: same — if on hold, show notice, do not render `RequestDeliveryForm`.

- [ ] **Step 4: Re-run copy tests**

`cd frontend && node --import tsx --test src/lib/dispatch/mexyOnHold.test.ts`

Expected: PASS.

- [ ] **Step 5: Do not commit**

---

### Task 7: Public digital menu — silent omit

**Files:**
- Modify: `frontend/src/lib/digital-menu/checkout/fulfillment.ts`
- Create: `frontend/src/lib/digital-menu/checkout/fulfillment.test.ts`
- Modify: `frontend/src/components/pages/PublicDigitalMenuPage.tsx`
- Modify: `frontend/src/components/digital-menu/PublicDesktopMenuLayout.tsx` only if it receives `enabledServices` already (pass through)

**Interfaces:**
- Consumes: `config.delivery_service?.on_hold`
- Produces: `resolveAvailableServices` omits `'delivery'` when `on_hold`; weather-unavailable still includes `'delivery'`

- [ ] **Step 1: Write failing tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicCheckoutConfig } from '@/lib/api/public';
import { resolveAvailableServices } from './fulfillment';

function config(overrides: Partial<PublicCheckoutConfig> = {}): PublicCheckoutConfig {
  return {
    takeout_enabled: true,
    delivery_enabled: true,
    payment_methods: [],
    delivery_service: {
      available: false,
      reason: 'Mexy pausó las entregas de tu negocio. Escríbenos por WhatsApp para reactivarlas.',
      partnership_status: 'active',
      provider_name: 'Mexy',
      weather_mode: 'none',
      on_hold: true,
    },
    ...overrides,
  };
}

test('on_hold omits delivery from customer services', () => {
  assert.deepEqual(resolveAvailableServices(config()), ['takeout']);
});

test('weather unavailable still offers delivery as a service type', () => {
  const weather = config({
    delivery_service: {
      available: false,
      reason: 'El servicio de reparto no está disponible en este momento. Mexy pausó las entregas por lluvia intensa.',
      partnership_status: 'active',
      provider_name: 'Mexy',
      weather_mode: 'intense',
      on_hold: false,
    },
  });
  assert.deepEqual(resolveAvailableServices(weather), ['delivery', 'takeout']);
});
```

If tsx cannot resolve `@/`, use relative import `../../api/public` like other dashboard tests, or run from `frontend` where tsx resolves paths.

- [ ] **Step 2: Run — expect FAIL** (`['delivery','takeout']` while on hold)

`cd frontend && node --import tsx --test src/lib/digital-menu/checkout/fulfillment.test.ts`

- [ ] **Step 3: Implement**

```ts
export function resolveAvailableServices(config: PublicCheckoutConfig): RestaurantServiceType[] {
  return RESTAURANT_SERVICE_ORDER.filter((type) => {
    if (type === 'takeout') return config.takeout_enabled;
    if (!config.delivery_enabled) return false;
    if (config.delivery_service?.on_hold) return false;
    return true;
  });
}
```

`resolveCheckoutFulfillmentFromPreferences` already falls back when `'delivery'` is not in `services`.

`PublicDigitalMenuPage.loadCritical`: `Promise.all` also `getPublicCheckoutConfig(subdomain)` (catch → null). Compute chips with `resolveAvailableServices({ takeout_enabled, delivery_enabled, payment_methods: [], delivery_service })` instead of `resolveRestaurantServices(restaurant)` so hero chips match checkout. Do **not** render `delivery_service.reason` on this page.

- [ ] **Step 4: Re-run fulfillment tests**

Expected: PASS.

- [ ] **Step 5: Do not commit**

---

## Verification (after all tasks)

- `cd backend && .venv/bin/alembic upgrade head`
- `cd backend && .venv/bin/pytest tests/modules/test_public_delivery_quote_service.py tests/api/test_delivery_partnerships.py tests/api/test_restaurant_dispatch_requests.py -q`
- `cd frontend && node --import tsx --test src/lib/dispatch/mexyOnHold.test.ts src/lib/digital-menu/checkout/fulfillment.test.ts`
- `cd delivery-dashboard && ../frontend/node_modules/.bin/tsx --test src/lib/api/partnershipQuery.test.ts`
- Browser: Mexy `/partnerships` hold → restaurant `/delivery` WhatsApp notice → public menu has takeout only, no alert → unhold restores both.

## Spec coverage

| Spec item | Task |
|-----------|------|
| `on_hold` column + DTOs | 1 |
| Quote/checkout unavailable + `on_hold` flag | 2 |
| PATCH / list filter / SSE | 3 |
| New dispatch rejected; in-flight untouched | 4 |
| Dashboard badge, confirm, filter | 5 |
| Restaurant WhatsApp notice | 6 |
| Public menu silent omit | 7 |
| Public POST delivery still fails via `available=False` | 2 (existing payment/service path) |

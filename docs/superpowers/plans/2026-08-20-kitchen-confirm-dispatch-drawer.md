# Kitchen Confirm Dispatch Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/orders`, confirming a new delivery order opens a right-side drawer with the shared Solicitar delivery form prefilled; one button creates the dispatch request then confirms the order, then shows the `/delivery` success card.

**Architecture:** Extract `RequestDeliveryForm` and `DispatchRequestSuccess` from `DeliveryPage`. Add pure helpers to map an `Order` onto form values and to run create-dispatch-then-confirm. `KitchenOrdersView` opens `OrderDispatchDrawer` only for `pending` + `delivery`; takeout still confirms immediately.

**Tech Stack:** Next.js 16, React 19, existing `createDispatchRequest` / `updateRestaurantOrderStatus`, CSS modules, `node --import tsx --test`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-20-kitchen-confirm-dispatch-drawer-design.es.md`
- Only `status === 'pending'` and `type === 'delivery'` open the drawer.
- Takeout/recoger: Confirmar still PATCHes to `confirmed` immediately.
- Click Confirmar on delivery: open drawer only. Do not change order status yet.
- Submit order: `createDispatchRequest` first, then `pending` → `confirmed`. If create fails, do not confirm.
- Kitchen submit label: `Continuar y solicitar repartidor`. Delivery page label stays `Solicitar repartidor`.
- Drawer: right side, `width: min(640px, 92vw)` desktop; `width: 100%` at `max-width: 900px`. `z-index` above kitchen mobile overlay (`40`) and cancel dialog (`50`) → use `70`.
- Same POST body and endpoint as `/delivery`. No `order_id` FK.
- No new palette or fonts.
- Frontend tests: `cd frontend && node --import tsx --test <path>`
- TDD for pure helpers: failing test first; watch it fail; then implement.
- Do not commit unless the user explicitly asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `frontend/src/lib/orders/kitchenDispatch.ts` | Split address, map `Order` → form values, decide drawer vs confirm, create-then-confirm sequence |
| `frontend/src/lib/orders/kitchenDispatch.test.ts` | node:test for those helpers |
| `frontend/src/components/dispatch/DispatchRequestSuccess.tsx` | Tracking success card (copy / WhatsApp / open) |
| `frontend/src/components/dispatch/DispatchRequestSuccess.module.css` | Success styles moved from `DeliveryPage.module.css` |
| `frontend/src/components/dispatch/RequestDeliveryForm.tsx` | Shared solicitar-delivery form + quote + POST |
| `frontend/src/components/dispatch/RequestDeliveryForm.module.css` | Form field styles moved from `DeliveryPage.module.css` |
| `frontend/src/components/dispatch/OrderDispatchDrawer.tsx` | Right drawer: form → success; confirm after create |
| `frontend/src/components/dispatch/OrderDispatchDrawer.module.css` | Backdrop + panel + mobile full width |
| `frontend/src/components/pages/DeliveryPage.tsx` | Collapsible chrome + list; uses extracted form + success |
| `frontend/src/components/pages/DeliveryPage.module.css` | Keep page/header/live/list/collapsible; drop moved form/success rules |
| `frontend/src/components/orders/KitchenOrdersView.tsx` | Open drawer on delivery confirm; keep takeout confirm |

---

### Task 1: Pure kitchen dispatch helpers

**Files:**
- Create: `frontend/src/lib/orders/kitchenDispatch.ts`
- Test: `frontend/src/lib/orders/kitchenDispatch.test.ts`

**Interfaces:**
- Consumes: `Order` from `@/lib/api/types`, `parseE164Phone` from `@/lib/phone/parseE164`, `buildOrderTotalsBreakdown` from `@/lib/orders/orderDisplay`, `ORDER_STATUS_META` from `@/lib/orders/orderStatus`
- Produces:
  - `KitchenDispatchFormValues` type
  - `splitDeliveryAddress(raw: string | null): { address: string; references: string }`
  - `centsToPesosInput(cents: number): string`
  - `orderToDispatchFormValues(order: Order): KitchenDispatchFormValues`
  - `kitchenConfirmOpensDispatch(order: Order): boolean`
  - `requestRiderThenConfirmOrder<TRequest, TOrder>(opts: { createDispatch: () => Promise<TRequest>; confirmOrder: () => Promise<TOrder> }): Promise<{ status: 'ok'; request: TRequest; order: TOrder } | { status: 'create_failed'; error: unknown } | { status: 'confirm_failed'; request: TRequest; error: unknown }>`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/orders/kitchenDispatch.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import type { Order } from '@/lib/api/types';
import {
  centsToPesosInput,
  kitchenConfirmOpensDispatch,
  orderToDispatchFormValues,
  requestRiderThenConfirmOrder,
  splitDeliveryAddress,
} from './kitchenDispatch.ts';

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    restaurant_id: 'rest-1',
    type: 'delivery',
    customer_name: 'María López',
    customer_phone: '+525512345678',
    payment_method: 'cash',
    subtotal_cents: 18000,
    subtotal_before_discount_cents: 18000,
    discount_cents: 0,
    total_cents: 22500,
    applied_order_promotion_id: null,
    applied_order_discounts: [],
    status: 'pending',
    delivery_address: 'Calle Reforma 100\nReferencias: puerta azul',
    delivery_latitude: 19.4326,
    delivery_longitude: -99.1332,
    delivery_fee_cents: 4500,
    cash_denomination_cents: 50000,
    cancellation_reason: null,
    idempotency_key: null,
    note: null,
    created_at: '2026-08-20T12:00:00Z',
    updated_at: '2026-08-20T12:00:00Z',
    items: [],
    ...overrides,
  };
}

test('splitDeliveryAddress separates checkout referencias', () => {
  assert.deepEqual(splitDeliveryAddress('Calle Reforma 100\nReferencias: puerta azul'), {
    address: 'Calle Reforma 100',
    references: 'puerta azul',
  });
});

test('splitDeliveryAddress keeps plain address', () => {
  assert.deepEqual(splitDeliveryAddress('Calle Reforma 100'), {
    address: 'Calle Reforma 100',
    references: '',
  });
});

test('centsToPesosInput converts centavos to input pesos', () => {
  assert.equal(centsToPesosInput(18000), '180');
  assert.equal(centsToPesosInput(15050), '150.5');
});

test('orderToDispatchFormValues prefills delivery cash order without shipping fee', () => {
  const values = orderToDispatchFormValues(baseOrder());
  assert.equal(values.customerName, 'María López');
  assert.equal(values.phoneCountryIso, 'MX');
  assert.equal(values.phoneLocal, '5512345678');
  assert.equal(values.address, 'Calle Reforma 100');
  assert.equal(values.addressReferences, 'puerta azul');
  assert.equal(values.latitude, 19.4326);
  assert.equal(values.longitude, -99.1332);
  assert.equal(values.paymentMethod, 'cash');
  assert.equal(values.collectAmount, '180');
  assert.equal(values.cashDenomination, '500');
});

test('orderToDispatchFormValues omits collect denomination for transfer', () => {
  const values = orderToDispatchFormValues(
    baseOrder({ payment_method: 'transfer', cash_denomination_cents: null }),
  );
  assert.equal(values.paymentMethod, 'transfer');
  assert.equal(values.collectAmount, '180');
  assert.equal(values.cashDenomination, '');
});

test('kitchenConfirmOpensDispatch only for pending delivery', () => {
  assert.equal(kitchenConfirmOpensDispatch(baseOrder()), true);
  assert.equal(kitchenConfirmOpensDispatch(baseOrder({ type: 'takeout' })), false);
  assert.equal(kitchenConfirmOpensDispatch(baseOrder({ status: 'confirmed' })), false);
});

test('requestRiderThenConfirmOrder does not confirm when create fails', async () => {
  let confirmed = false;
  const result = await requestRiderThenConfirmOrder({
    createDispatch: async () => {
      throw new Error('dispatch down');
    },
    confirmOrder: async () => {
      confirmed = true;
      return { id: 'order' };
    },
  });
  assert.equal(result.status, 'create_failed');
  assert.equal(confirmed, false);
});

test('requestRiderThenConfirmOrder confirms after successful create', async () => {
  const calls: string[] = [];
  const result = await requestRiderThenConfirmOrder({
    createDispatch: async () => {
      calls.push('create');
      return { id: 'req-1' };
    },
    confirmOrder: async () => {
      calls.push('confirm');
      return { id: 'order-1' };
    },
  });
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.equal(result.request.id, 'req-1');
    assert.equal(result.order.id, 'order-1');
  }
  assert.deepEqual(calls, ['create', 'confirm']);
});

test('requestRiderThenConfirmOrder keeps request when confirm fails', async () => {
  const result = await requestRiderThenConfirmOrder({
    createDispatch: async () => ({ id: 'req-1' }),
    confirmOrder: async () => {
      throw new Error('status patch failed');
    },
  });
  assert.equal(result.status, 'confirm_failed');
  if (result.status === 'confirm_failed') {
    assert.equal(result.request.id, 'req-1');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --import tsx --test src/lib/orders/kitchenDispatch.test.ts`

Expected: FAIL with `Cannot find module` / `kitchenDispatch.ts` not found.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/orders/kitchenDispatch.ts`:

```ts
import type { Order } from '@/lib/api/types';
import { buildOrderTotalsBreakdown } from '@/lib/orders/orderDisplay';
import { parseE164Phone } from '@/lib/phone/parseE164';

const REFERENCES_MARKER = '\nReferencias:';

export type KitchenDispatchFormValues = {
  customerName: string;
  phoneCountryIso: string;
  phoneLocal: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  addressReferences: string;
  paymentMethod: Order['payment_method'];
  collectAmount: string;
  cashDenomination: string;
};

export function splitDeliveryAddress(raw: string | null): {
  address: string;
  references: string;
} {
  const text = raw?.trim() ?? '';
  const index = text.indexOf(REFERENCES_MARKER);
  if (index === -1) {
    return { address: text, references: '' };
  }
  return {
    address: text.slice(0, index).trim(),
    references: text.slice(index + REFERENCES_MARKER.length).trim(),
  };
}

export function centsToPesosInput(cents: number): string {
  return String(cents / 100);
}

export function orderToDispatchFormValues(order: Order): KitchenDispatchFormValues {
  const { address, references } = splitDeliveryAddress(order.delivery_address);
  const phone = parseE164Phone(order.customer_phone);
  const restaurantCents = buildOrderTotalsBreakdown(order).restaurantSubtotalCents;
  return {
    customerName: order.customer_name,
    phoneCountryIso: phone.countryIso,
    phoneLocal: phone.localNumber,
    address,
    latitude: order.delivery_latitude,
    longitude: order.delivery_longitude,
    addressReferences: references,
    paymentMethod: order.payment_method,
    collectAmount: centsToPesosInput(restaurantCents),
    cashDenomination:
      order.payment_method === 'cash' && order.cash_denomination_cents != null
        ? centsToPesosInput(order.cash_denomination_cents)
        : '',
  };
}

export function kitchenConfirmOpensDispatch(order: Order): boolean {
  return order.status === 'pending' && order.type === 'delivery';
}

export async function requestRiderThenConfirmOrder<TRequest, TOrder>(opts: {
  createDispatch: () => Promise<TRequest>;
  confirmOrder: () => Promise<TOrder>;
}): Promise<
  | { status: 'ok'; request: TRequest; order: TOrder }
  | { status: 'create_failed'; error: unknown }
  | { status: 'confirm_failed'; request: TRequest; error: unknown }
> {
  let request: TRequest;
  try {
    request = await opts.createDispatch();
  } catch (error) {
    return { status: 'create_failed', error };
  }
  try {
    const order = await opts.confirmOrder();
    return { status: 'ok', request, order };
  } catch (error) {
    return { status: 'confirm_failed', request, error };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --import tsx --test src/lib/orders/kitchenDispatch.test.ts`

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

```bash
git add frontend/src/lib/orders/kitchenDispatch.ts frontend/src/lib/orders/kitchenDispatch.test.ts
git commit -m "feat(frontend): map kitchen delivery orders onto dispatch form values"
```

---

### Task 2: Extract DispatchRequestSuccess

**Files:**
- Create: `frontend/src/components/dispatch/DispatchRequestSuccess.tsx`
- Create: `frontend/src/components/dispatch/DispatchRequestSuccess.module.css`
- Modify: `frontend/src/components/pages/DeliveryPage.tsx` (replace inline success JSX)
- Modify: `frontend/src/components/pages/DeliveryPage.module.css` (move `.success*` rules)

**Interfaces:**
- Consumes: `DispatchRequest` from `@/lib/api/dispatch`, `formatDispatchShortId`, `formatMoney`, `publicMenuOrigin`
- Produces:
  - `DispatchRequestSuccess({ request, subdomain, onDismiss }: { request: DispatchRequest; subdomain: string; onDismiss: () => void })`

- [ ] **Step 1: Move success CSS**

Copy these selectors verbatim from `frontend/src/components/pages/DeliveryPage.module.css` into `frontend/src/components/dispatch/DispatchRequestSuccess.module.css`:

- `.success`, `.successMark`, `.successBody`, `.successHeading`, `.success h2`, `.successDismiss`, `.successDismiss:hover`, `.successMeta`, `.successCosts`, `.successActions`, `.successAction`, `.successAction:hover`, `.successWhatsApp`, `.successWhatsApp:hover`
- Keep the shared `:focus-visible` rules that mention `.successAction` / `.successDismiss` in the new file (duplicate the focus block for those two classes).

Delete those `.success*` rules from `DeliveryPage.module.css`. Leave `.page`, header, live, list, collapsible, form rules for Task 3.

- [ ] **Step 2: Create the success component**

Create `frontend/src/components/dispatch/DispatchRequestSuccess.tsx` by moving the success `<section>` from `DeliveryPage.tsx` (the block that starts with `{createdIsOpen && trackingUrl ? (`). Include `shareTrackingWhatsApp` in this file (cut it from `DeliveryPage.tsx`).

```tsx
'use client';

import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useMemo, useState } from 'react';
import {
  formatDispatchShortId,
  isDispatchHistoryStatus,
  type DispatchRequest,
} from '@/lib/api/dispatch';
import { formatMoney } from '@/lib/currency';
import { publicMenuOrigin } from '@/lib/restaurantSubdomain';
import styles from './DispatchRequestSuccess.module.css';

function shareTrackingWhatsApp(shortId: string, url: string) {
  const text = `Rastrea tu entrega ${shortId}\n${url}`;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer',
  );
}

export function DispatchRequestSuccess({
  request,
  subdomain,
  onDismiss,
}: {
  request: DispatchRequest;
  subdomain: string;
  onDismiss: () => void;
}) {
  const [copiedTracking, setCopiedTracking] = useState(false);
  const trackingUrl = `${publicMenuOrigin(subdomain)}/rastreo/${request.tracking_token}`;
  const isOpen = !isDispatchHistoryStatus(request.status);

  const searchLabel = useMemo(
    () =>
      new Date(request.search_at).toLocaleString('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [request.search_at],
  );

  async function copyCreatedTracking() {
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopiedTracking(true);
      window.setTimeout(() => setCopiedTracking(false), 2000);
    } catch {
      window.prompt('Copia el enlace de rastreo', trackingUrl);
    }
  }

  if (!isOpen) return null;

  return (
    <section className={styles.success} aria-live="polite">
      <div className={styles.successMark} aria-hidden>
        <CheckOutlinedIcon fontSize="small" />
      </div>
      <div className={styles.successBody}>
        <div className={styles.successHeading}>
          <h2>Pedido {formatDispatchShortId(request.short_id)} solicitado</h2>
          <button
            type="button"
            className={styles.successDismiss}
            aria-label="Cerrar aviso"
            onClick={onDismiss}
          >
            <CloseOutlinedIcon sx={{ fontSize: 18 }} />
          </button>
        </div>
        <p className={styles.successMeta}>Búsqueda {searchLabel}</p>
        <p className={styles.successCosts}>
          {request.payment_method === 'transfer' ? (
            <span>Envío {formatMoney(request.quoted_fee_cents / 100, 'MXN')}</span>
          ) : (
            <>
              <span>Restaurante {formatMoney(request.collect_cents / 100, 'MXN')}</span>
              <span aria-hidden>·</span>
              <span>Envío {formatMoney(request.quoted_fee_cents / 100, 'MXN')}</span>
            </>
          )}
        </p>
        <div className={styles.successActions}>
          <button type="button" className={styles.successAction} onClick={() => void copyCreatedTracking()}>
            {copiedTracking ? <CheckOutlinedIcon fontSize="small" /> : <ContentCopyOutlinedIcon fontSize="small" />}
            {copiedTracking ? 'Enlace copiado' : 'Copiar rastreo'}
          </button>
          <button
            type="button"
            className={`${styles.successAction} ${styles.successWhatsApp}`}
            onClick={() => shareTrackingWhatsApp(formatDispatchShortId(request.short_id), trackingUrl)}
          >
            <WhatsAppIcon fontSize="small" />
            WhatsApp
          </button>
          <a className={styles.successAction} href={trackingUrl} target="_blank" rel="noreferrer">
            <OpenInNewOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
            Abrir rastreo
          </a>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire DeliveryPage**

In `DeliveryPage.tsx`:

- Remove `shareTrackingWhatsApp`, `copyCreatedTracking`, `copiedTracking` state, `trackingUrl` memo, and the inline success `<section>`.
- Import `DispatchRequestSuccess`.
- Render after the form section:

```tsx
{created && subdomain ? (
  <DispatchRequestSuccess
    request={created}
    subdomain={subdomain}
    onDismiss={() => setCreated(null)}
  />
) : null}
```

`created` may be a history status; the component returns `null` in that case (same as today's `createdIsOpen && trackingUrl`).

Remove unused icon imports that only the success block used (`CheckOutlinedIcon`, `CloseOutlinedIcon`, `ContentCopyOutlinedIcon`, `OpenInNewOutlinedIcon`, `WhatsAppIcon`) if DeliveryPage no longer references them.

- [ ] **Step 4: Smoke-check `/delivery`**

Run: `cd frontend && pnpm exec tsc --noEmit`

Expected: no new errors in the touched files.

Manually: `/delivery` still shows the success card after requesting a rider (copy / WhatsApp / abrir rastreo).

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

```bash
git add frontend/src/components/dispatch/DispatchRequestSuccess.tsx frontend/src/components/dispatch/DispatchRequestSuccess.module.css frontend/src/components/pages/DeliveryPage.tsx frontend/src/components/pages/DeliveryPage.module.css
git commit -m "refactor(frontend): extract dispatch request success card"
```

---

### Task 3: Extract RequestDeliveryForm and reuse it on `/delivery`

**Files:**
- Create: `frontend/src/components/dispatch/RequestDeliveryForm.tsx`
- Create: `frontend/src/components/dispatch/RequestDeliveryForm.module.css`
- Modify: `frontend/src/components/pages/DeliveryPage.tsx`
- Modify: `frontend/src/components/pages/DeliveryPage.module.css` (move remaining form-field rules)

**Interfaces:**
- Consumes: `KitchenDispatchFormValues` from `@/lib/orders/kitchenDispatch`, `createDispatchRequest`, `resolveDispatchMapsUrl`, `usePublicDeliveryQuote`, `DispatchDeliveryAddressPicker`
- Produces:
  - `RequestDeliveryForm(props: { accessToken: string; restaurantId: string; subdomain: string; courierAvailable: boolean; courierReason: string | null; leadTimes: number[]; initialValues?: KitchenDispatchFormValues | null; submitLabel?: string; resetOnSuccess?: boolean; onCreated: (request: DispatchRequest) => void | Promise<void>; })`

- [ ] **Step 1: Move form CSS**

Move these selectors from `DeliveryPage.module.css` into `RequestDeliveryForm.module.css`:

`.form`, `.grid`, `.gridTwo`, `.gridThree`, `.field`, `.label`, `.optional`, `.input`, `.textarea`, disabled/focus variants for inputs, `.form label`, `.locationSelected`, `.weightNotice`, `.primaryButton` (+ hover/disabled), `.error`, `.serviceAlert`, `.quoteAlert`, `.quoteStatus`, `.fieldHint`, `.feeCard`, `.feeLabel`, `.feeValue`, `.feeHint`, `.weatherNotice`, `.weatherIcon`

Keep on DeliveryPage: `.page`, header, live, `.formSection*`, `.formToggle*`, `.formTitle`, `.formSummary`, `.formChevron*`, `.formPanel*`, `.formSubtitle`, list tabs, loading.

If `.error` is still used at page level in DeliveryPage (the banner above the form), keep a copy of `.error` in **both** CSS modules.

- [ ] **Step 2: Create RequestDeliveryForm**

Create `frontend/src/components/dispatch/RequestDeliveryForm.tsx`. Move from `DeliveryPage.tsx`:

- `PREP_CUSTOM_VALUE`, `EMPTY_LOCATION`, `parsePesosToCents`
- State: `location`, `mapsUrl`, `addressReferences`, `paymentMethod`, `packageSize`, `packageCount`, `prepSelection`, `customPrepMinutes`, `collectAmount`, `cashDenomination`, `customerName`, `phoneCountryIso`, `phoneLocal`, `notes`, `submitting`, plus a local `error`
- `prepMinutes`, `prepValid`, quote hook, `canRequestRider`, `paymentOptions`, `packageSizeOptions`, `prepOptions`, `submit`

Apply `initialValues` when present:

```tsx
function valuesToLocation(values?: KitchenDispatchFormValues | null): DeliveryLocationValue {
  if (!values) return EMPTY_LOCATION;
  return {
    address: values.address,
    latitude: values.latitude,
    longitude: values.longitude,
    placeId: null,
  };
}

export function RequestDeliveryForm({
  accessToken,
  restaurantId,
  subdomain,
  courierAvailable,
  courierReason,
  leadTimes,
  initialValues = null,
  submitLabel = 'Solicitar repartidor',
  resetOnSuccess = true,
  onCreated,
}: {
  accessToken: string;
  restaurantId: string;
  subdomain: string;
  courierAvailable: boolean;
  courierReason: string | null;
  leadTimes: number[];
  initialValues?: KitchenDispatchFormValues | null;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  onCreated: (request: DispatchRequest) => void | Promise<void>;
}) {
  // initialize each field from initialValues ?? defaults
```

`useEffect` when `initialValues` identity changes (kitchen passes a new object per order id):

```tsx
useEffect(() => {
  if (!initialValues) return;
  setCustomerName(initialValues.customerName);
  setPhoneCountryIso(initialValues.phoneCountryIso);
  setPhoneLocal(initialValues.phoneLocal);
  setLocation(valuesToLocation(initialValues));
  setMapsUrl(null);
  setAddressReferences(initialValues.addressReferences);
  setPaymentMethod(initialValues.paymentMethod);
  setCollectAmount(initialValues.collectAmount);
  setCashDenomination(initialValues.cashDenomination);
  setPackageSize('normal');
  setPackageCount('1');
  setNotes('');
}, [initialValues]);
```

Keep prep selection logic from DeliveryPage (`leadTimes[0]` default, custom option).

`resolveMapsUrlForPicker` stays inside the form:

```tsx
const resolveMapsUrlForPicker = useCallback(
  async (url: string) => {
    const resolved = await resolveDispatchMapsUrl(accessToken, restaurantId, url);
    return { latitude: resolved.latitude, longitude: resolved.longitude };
  },
  [accessToken, restaurantId],
);
```

Change `submit` after a successful `createDispatchRequest`:

```ts
const row = await createDispatchRequest(accessToken, restaurantId, { /* same body as DeliveryPage */ });
await onCreated(row);
if (resetOnSuccess) {
  setLocation(EMPTY_LOCATION);
  setMapsUrl(null);
  setAddressReferences('');
  setPaymentMethod('cash');
  setPackageSize('normal');
  setPackageCount('1');
  setCollectAmount('0');
  setCashDenomination('');
  setCustomPrepMinutes('');
  setCustomerName('');
  setPhoneCountryIso(DEFAULT_COUNTRY_ISO);
  setPhoneLocal('');
  setNotes('');
  if (leadTimes[0] != null) setPrepSelection(String(leadTimes[0]));
}
```

Do **not** call `event.currentTarget.reset()`.

Move the inner `<form>...</form>` JSX from DeliveryPage (from the grid of name/phone through the submit button). Render `courierReason` alert inside the form when `!courierAvailable`. Change the submit button text to `{submitting ? 'Solicitando…' : submitLabel}`.

- [ ] **Step 3: Slim DeliveryPage**

DeliveryPage keeps: auth, restaurant load, `requests`, `leadTimes`, `deliveryService`, `subdomain`, `created`, collapsible chrome, recent list, confirm dialogs.

Replace the inner form with:

```tsx
<RequestDeliveryForm
  accessToken={accessToken}
  restaurantId={selectedRestaurantId}
  subdomain={subdomain}
  courierAvailable={courierAvailable}
  courierReason={courierReason}
  leadTimes={leadTimes}
  submitLabel="Solicitar repartidor"
  resetOnSuccess
  onCreated={(row) => {
    setCreated(row);
    setRequests((current) => [row, ...current]);
    setFormExpanded(false);
  }}
/>
```

Remove form field state and `submit` / `canRequestRider` / quote hook from DeliveryPage. Keep `load()` (restaurant, partnership, list, lead times, checkout config).

If `!accessToken || !selectedRestaurantId`, do not render the form (page already returns loading).

- [ ] **Step 4: Typecheck + helper tests still pass**

Run:

```bash
cd frontend && pnpm exec tsc --noEmit
cd frontend && node --import tsx --test src/lib/orders/kitchenDispatch.test.ts
```

Expected: tsc clean for touched files; kitchenDispatch tests PASS.

Manually: `/delivery` still requests a rider with the same fields and POST.

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

```bash
git add frontend/src/components/dispatch/RequestDeliveryForm.tsx frontend/src/components/dispatch/RequestDeliveryForm.module.css frontend/src/components/pages/DeliveryPage.tsx frontend/src/components/pages/DeliveryPage.module.css
git commit -m "refactor(frontend): extract shared RequestDeliveryForm"
```

---

### Task 4: OrderDispatchDrawer on `/orders`

**Files:**
- Create: `frontend/src/components/dispatch/OrderDispatchDrawer.tsx`
- Create: `frontend/src/components/dispatch/OrderDispatchDrawer.module.css`
- Modify: `frontend/src/components/orders/KitchenOrdersView.tsx`

**Interfaces:**
- Consumes: `kitchenConfirmOpensDispatch`, `orderToDispatchFormValues`, `requestRiderThenConfirmOrder`, `RequestDeliveryForm`, `DispatchRequestSuccess`, `updateRestaurantOrderStatus`, `getRestaurant`, `listDispatchLeadTimes`, `getPublicCheckoutConfig`, `syncRestaurantDeliveryPartnership`, `isActiveDeliveryPartnership`
- Produces: `OrderDispatchDrawer({ open, order, accessToken, restaurantId, onClose, onOrderConfirmed }: { open: boolean; order: Order | null; accessToken: string; restaurantId: string; onClose: () => void; onOrderConfirmed: (order: Order) => void })`

- [ ] **Step 1: Drawer CSS**

Create `frontend/src/components/dispatch/OrderDispatchDrawer.module.css`:

```css
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  z-index: 70;
  padding: 0;
}

.panel {
  width: min(640px, 92vw);
  height: 100%;
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
  border-left: 1px solid var(--color-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: drawerIn 160ms ease-out;
}

@keyframes drawerIn {
  from { transform: translateX(12px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .panel {
    animation: none;
  }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 900;
}

.closeBtn {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-secondary);
  min-width: 44px;
  min-height: 44px;
}

.body {
  padding: 1rem;
  overflow: auto;
  flex: 1;
}

.retry {
  margin: 0 0 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.retryText {
  margin: 0;
  color: #b91c1c;
  font-size: 0.88rem;
}

.retryBtn {
  justify-self: start;
  border: 0;
  border-radius: 12px;
  background: var(--color-primary);
  padding: 0.65rem 1.1rem;
  min-height: 44px;
  color: #fff;
  font-weight: 800;
  cursor: pointer;
}

.loading {
  margin: 0;
  color: var(--color-text-secondary);
}

@media (max-width: 900px) {
  .panel {
    width: 100%;
  }
}
```

- [ ] **Step 2: Implement OrderDispatchDrawer**

Create `frontend/src/components/dispatch/OrderDispatchDrawer.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DispatchRequestSuccess } from '@/components/dispatch/DispatchRequestSuccess';
import { RequestDeliveryForm } from '@/components/dispatch/RequestDeliveryForm';
import { updateRestaurantOrderStatus } from '@/lib/api/orders';
import { listDispatchLeadTimes, type DispatchRequest } from '@/lib/api/dispatch';
import { getPublicCheckoutConfig } from '@/lib/api/public';
import { ApiError } from '@/lib/api/types';
import type { Order } from '@/lib/api/types';
import { getRestaurant } from '@/lib/api/restaurants';
import { isActiveDeliveryPartnership } from '@/lib/fetchActiveDeliveryProviderConfig';
import {
  kitchenConfirmOpensDispatch,
  orderToDispatchFormValues,
  requestRiderThenConfirmOrder,
} from '@/lib/orders/kitchenDispatch';
import { formatOrderDisplayId } from '@/lib/orders/orderDisplay';
import { syncRestaurantDeliveryPartnership } from '@/lib/syncDeliveryPartnership';
import styles from './OrderDispatchDrawer.module.css';

export function OrderDispatchDrawer({
  open,
  order,
  accessToken,
  restaurantId,
  onClose,
  onOrderConfirmed,
}: {
  open: boolean;
  order: Order | null;
  accessToken: string;
  restaurantId: string;
  onClose: () => void;
  onOrderConfirmed: (order: Order) => void;
}) {
  const [subdomain, setSubdomain] = useState('');
  const [leadTimes, setLeadTimes] = useState<number[]>([]);
  const [courierAvailable, setCourierAvailable] = useState(false);
  const [courierReason, setCourierReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [created, setCreated] = useState<DispatchRequest | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const initialValues = useMemo(
    () => (order && kitchenConfirmOpensDispatch(order) ? orderToDispatchFormValues(order) : null),
    [order],
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setCreated(null);
      setConfirmError(null);
    }
  }, [open, order?.id]);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const restaurant = await getRestaurant(accessToken, restaurantId);
      const partnership = await syncRestaurantDeliveryPartnership(
        accessToken,
        restaurantId,
        restaurant.delivery_enabled,
      );
      if (!isActiveDeliveryPartnership(partnership)) {
        setCourierAvailable(false);
        setCourierReason('No tienes un repartidor activo');
        setSubdomain(restaurant.subdomain);
        setLeadTimes([]);
        return;
      }
      const [times, checkoutConfig] = await Promise.all([
        listDispatchLeadTimes(accessToken, restaurantId),
        getPublicCheckoutConfig(restaurant.subdomain),
      ]);
      setSubdomain(restaurant.subdomain);
      setLeadTimes(times.map((item) => item.prep_minutes));
      setCourierAvailable(checkoutConfig.delivery_service?.available ?? false);
      setCourierReason(checkoutConfig.delivery_service?.reason ?? null);
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : 'No se pudo cargar Delivery.',
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, restaurantId]);

  useEffect(() => {
    if (!open) return;
    void loadSetup();
  }, [open, loadSetup]);

  const confirmOrder = useCallback(async () => {
    if (!order) throw new Error('Pedido no disponible');
    return updateRestaurantOrderStatus(accessToken, restaurantId, order.id, 'confirmed');
  }, [accessToken, order, restaurantId]);

  const handleCreated = useCallback(
    async (request: DispatchRequest) => {
      const result = await requestRiderThenConfirmOrder({
        createDispatch: async () => request,
        confirmOrder,
      });
      if (result.status === 'ok') {
        onOrderConfirmed(result.order);
        setCreated(result.request);
        setConfirmError(null);
        return;
      }
      if (result.status === 'confirm_failed') {
        setCreated(result.request);
        setConfirmError('El repartidor ya se solicitó, pero no se pudo confirmar el pedido.');
      }
    },
    [confirmOrder, onOrderConfirmed],
  );

  async function retryConfirm() {
    if (!order || !created) return;
    setConfirming(true);
    try {
      const updated = await confirmOrder();
      onOrderConfirmed(updated);
      setConfirmError(null);
    } catch (error) {
      setConfirmError(
        error instanceof ApiError
          ? error.message
          : 'El repartidor ya se solicitó, pero no se pudo confirmar el pedido.',
      );
    } finally {
      setConfirming(false);
    }
  }

  if (!open || !order) return null;

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Solicitar delivery pedido ${formatOrderDisplayId(order)}`}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Solicitar delivery · #{formatOrderDisplayId(order)}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className={styles.body}>
          {loading ? <p className={styles.loading}>Cargando Delivery…</p> : null}
          {loadError ? <p className={styles.retryText}>{loadError}</p> : null}
          {created && subdomain ? (
            <>
              {confirmError ? (
                <div className={styles.retry}>
                  <p className={styles.retryText}>{confirmError}</p>
                  <button type="button" className={styles.retryBtn} disabled={confirming} onClick={() => void retryConfirm()}>
                    {confirming ? 'Confirmando…' : 'Reintentar confirmar pedido'}
                  </button>
                </div>
              ) : null}
              <DispatchRequestSuccess
                request={created}
                subdomain={subdomain}
                onDismiss={onClose}
              />
            </>
          ) : !loading && subdomain ? (
            <RequestDeliveryForm
              accessToken={accessToken}
              restaurantId={restaurantId}
              subdomain={subdomain}
              courierAvailable={courierAvailable}
              courierReason={courierReason}
              leadTimes={leadTimes}
              initialValues={initialValues}
              submitLabel="Continuar y solicitar repartidor"
              resetOnSuccess={false}
              onCreated={handleCreated}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

Important: `RequestDeliveryForm` already calls `createDispatchRequest`. `handleCreated` must **not** create again. Pass a resolved request into `requestRiderThenConfirmOrder.createDispatch` as `async () => request` so the helper still records create-then-confirm order and handles confirm failure without a second POST.

- [ ] **Step 3: Wire KitchenOrdersView**

In `KitchenOrdersView.tsx`:

1. Import `OrderDispatchDrawer` and `kitchenConfirmOpensDispatch`.
2. Add state: `const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);`
3. Change `handleAdvance`:

```tsx
const handleAdvance = async () => {
  if (!selectedOrder) return;
  const next = ORDER_STATUS_META[selectedOrder.status].nextStatus;
  if (!next) return;
  if (next === 'confirmed' && kitchenConfirmOpensDispatch(selectedOrder)) {
    setDispatchOrder(selectedOrder);
    return;
  }
  await patchOrder(selectedOrder.id, next);
};
```

4. Render the drawer next to `OrderCancelDialog`:

```tsx
{accessToken && restaurantId ? (
  <OrderDispatchDrawer
    open={dispatchOrder != null}
    order={dispatchOrder}
    accessToken={accessToken}
    restaurantId={restaurantId}
    onClose={() => setDispatchOrder(null)}
    onOrderConfirmed={(updated) => {
      replaceOrder(updated);
    }}
  />
) : null}
```

Closing without submit leaves `dispatchOrder` cleared and does not call `patchOrder`. The order stays `pending`.

After success, keep the drawer open (`onOrderConfirmed` only `replaceOrder`; do not `setDispatchOrder(null)`). User closes via X / backdrop / success dismiss.

- [ ] **Step 4: Verify helpers + types**

Run:

```bash
cd frontend && node --import tsx --test src/lib/orders/kitchenDispatch.test.ts
cd frontend && pnpm exec tsc --noEmit
```

Expected: tests PASS; tsc clean.

Manual:

1. `/orders`, new **para llevar**: Confirmar → confirmed, no drawer.
2. `/orders`, new **domicilio**: Confirmar → right drawer, fields prefilled (name, phone, address, payment, restaurant amount, cash bill).
3. Close drawer without submit → order still in Nuevos.
4. Continue → rider requested (same as `/delivery`) and order moves to Confirmados; success card with copy / WhatsApp / rastreo.
5. Mobile (`max-width: 900px`): drawer is full width over the ticket overlay.

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

```bash
git add frontend/src/components/dispatch/OrderDispatchDrawer.tsx frontend/src/components/dispatch/OrderDispatchDrawer.module.css frontend/src/components/orders/KitchenOrdersView.tsx
git commit -m "feat(frontend): confirm kitchen delivery orders via dispatch drawer"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| pending + delivery opens drawer | 1 (`kitchenConfirmOpensDispatch`) + 4 |
| takeout confirms immediately | 4 `handleAdvance` |
| Confirmar does not PATCH yet | 4 |
| createDispatch then confirm | 1 + 4 `handleCreated` |
| Kitchen button copy | 4 `submitLabel` |
| `/delivery` button copy unchanged | 3 |
| Right drawer, 640px / mobile 100% | 4 CSS |
| Autofill including Referencias | 1 |
| Defaults packages / prep / notes | 3 form defaults + 1 mapper |
| Success card in drawer | 2 + 4 |
| Close without submit stays pending | 4 |
| Create fail → no confirm | 1 test + form error path |
| Confirm fail → retry only | 4 |
| No order↔dispatch FK | no backend work |
| WhatsApp only on success/tracking | 2 (not on Confirmar) |

## Placeholder / consistency review

- Helper names in Task 4 match Task 1 (`kitchenConfirmOpensDispatch`, `orderToDispatchFormValues`, `requestRiderThenConfirmOrder`, `KitchenDispatchFormValues`).
- `RequestDeliveryForm` create happens once; drawer confirm uses the already-created `DispatchRequest`.
- No TBD / “handle edge cases” leftovers.

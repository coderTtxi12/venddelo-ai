# Free-shipping B2B fee absorption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the real delivery tariff on the order for the delivery company while the restaurant absorbs free-shipping (coupon or promotion) so the customer does not pay that fee.

**Architecture:** Stop zeroing `delivery_fee_cents` when free shipping applies. Persist the real fee on `orders.delivery_fee_cents` and the customer waiver on `orders.coupon_waived_delivery_cents` (also used for promo free shipping). Customer payable = food + max(0, fee − waived). Dispatch locks `quoted_fee` from the real fee, with a historical fallback when fee is 0 but waived > 0.

**Tech Stack:** FastAPI/SQLAlchemy (backend), Next.js/React (frontend), pytest, node:test, Alembic only if a column rename is chosen (default: keep `coupon_waived_delivery_cents` name).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-03-free-shipping-b2b-fee-design.es.md`
- `orders.delivery_fee_cents` is always the B2B delivery tariff when delivery is charged by the provider (never zeroed solely because of free shipping).
- Keep DB column name `coupon_waived_delivery_cents` (semantic: customer waiver from coupon **or** promo).
- Customer `total_cents` = food total + max(0, delivery_fee − waived).
- Dispatch historical fallback: if `delivery_fee_cents == 0` and `coupon_waived_delivery_cents > 0`, use waived as locked fee.
- Spanish UI copy for restaurant staff; customer-facing still shows “Envío gratis”.
- No delivery-dashboard changes unless `quoted_fee_cents` is still wrong after backend fix.
- Do not invent liquidación/accounting beyond fee fields.

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/modules/coupons/pricing.py` | Free-shipping coupon keeps real fee + sets waived |
| `backend/app/modules/orders/service.py` | Persist real fee; compute customer total; promo waived |
| `backend/app/modules/public/schemas.py` | Top-level `waived_delivery_cents` on cart quote |
| `backend/app/modules/public/api.py` | Stop zeroing fee for promo free shipping; set waived |
| `backend/app/modules/delivery_dispatch/service.py` | Lock fee with historical fallback |
| `frontend/src/lib/api/public.ts` | Types for quote waived |
| `frontend/src/lib/orders/deliveryFee.ts` (new) | Shared B2B vs customer delivery helpers |
| `frontend/src/lib/orders/orderDisplay.ts` | Kitchen totals use customer-due delivery |
| `frontend/src/components/orders/KitchenOrdersView.tsx` | Show free shipping / absorption clearly |
| `frontend/src/components/dispatch/RequestDeliveryForm.tsx` | Lock B2B fee + copy |
| `frontend/src/components/digital-menu/PublicMenuCheckoutSummary.tsx` | Customer due = fee − waived |
| `frontend/src/lib/digital-menu/checkout/formatWhatsAppOrderMessage.ts` | Customer message uses due fee |
| Tests under `backend/tests/...` and `frontend/src/lib/...` | TDD coverage |

---

### Task 1: Coupon pricing keeps real delivery fee

**Files:**
- Modify: `backend/app/modules/coupons/pricing.py` (`apply_coupon` free_shipping branch)
- Test: `backend/tests/modules/test_coupon_pricing.py`
- Test: `backend/tests/modules/test_coupon_quote_compose.py` (if free_shipping compose asserts fee 0)

**Interfaces:**
- Consumes: existing `CouponApplyResult(delivery_fee_cents, waived_delivery_cents, ...)`
- Produces: free_shipping success with `delivery_fee_cents == input fee` and `waived_delivery_cents == input fee`

- [ ] **Step 1: Update the failing expectation in the existing free-shipping test**

In `backend/tests/modules/test_coupon_pricing.py`, change `test_free_shipping_delivery_waives_fee` so after a successful free-shipping apply with `delivery_fee_cents=4500` it asserts:

```python
assert result.ok is True
assert result.waived_delivery_cents == 4500
assert result.delivery_fee_cents == 4500
assert result.food_total_cents == 10000
assert result.discount_cents == 0
```

(Remove any assertion that `delivery_fee_cents == 0`.)

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend && . .venv/bin/activate && python -m pytest tests/modules/test_coupon_pricing.py::test_free_shipping_delivery_waives_fee -v
```

Expected: FAIL because implementation still returns `delivery_fee_cents=0`.

- [ ] **Step 3: Implement minimal pricing change**

In `apply_coupon`, free_shipping success branch, change to:

```python
fee = max(delivery_fee_cents, 0)
return CouponApplyResult(
    ok=True,
    error_code=None,
    error_message=None,
    coupon_id=coupon.id,
    code=coupon.code,
    type=coupon.type,
    discount_cents=0,
    waived_delivery_cents=fee,
    food_total_cents=food_total_cents,
    delivery_fee_cents=fee,
)
```

Update any compose tests that expected `delivery_fee_cents == 0` for free shipping to expect the real fee + waived.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend && . .venv/bin/activate && python -m pytest tests/modules/test_coupon_pricing.py tests/modules/test_coupon_quote_compose.py -q
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/coupons/pricing.py backend/tests/modules/test_coupon_pricing.py backend/tests/modules/test_coupon_quote_compose.py
git commit -m "fix(coupons): keep real delivery fee when free shipping applies"
```

---

### Task 2: Order create — customer total uses fee − waived; promo can set waived

**Files:**
- Modify: `backend/app/modules/orders/service.py` (`_build_priced_order`, `create_public`)
- Test: add unit coverage in `backend/tests/modules/` (prefer a focused module test if create_public is heavy; otherwise extend API tests in Task 3)

**Interfaces:**
- Consumes: `price_cart(...).applied_free_shipping_promotion_id`, `apply_coupon` result from Task 1
- Produces: `_build_priced_order` also returns `applied_free_shipping_promotion_id: uuid.UUID | None`
- Produces: persisted `delivery_fee_cents` (real), `coupon_waived_delivery_cents` (waiver), `total_cents = food + max(0, fee - waived)`

- [ ] **Step 1: Write failing tests for order total math helper (extract if useful)**

Add `backend/tests/modules/test_order_delivery_fee.py`:

```python
from app.modules.orders.delivery_fee import customer_payable_delivery_cents, resolve_delivery_waiver_cents


def test_customer_payable_zero_when_fully_waived():
    assert customer_payable_delivery_cents(4500, 4500) == 0


def test_customer_payable_full_when_no_waiver():
    assert customer_payable_delivery_cents(4500, 0) == 4500


def test_resolve_waiver_prefers_coupon_then_promo_flag():
    assert resolve_delivery_waiver_cents(
        delivery_fee_cents=4500,
        coupon_waived_delivery_cents=4500,
        promo_free_shipping=True,
    ) == 4500
    assert resolve_delivery_waiver_cents(
        delivery_fee_cents=4500,
        coupon_waived_delivery_cents=0,
        promo_free_shipping=True,
    ) == 4500
    assert resolve_delivery_waiver_cents(
        delivery_fee_cents=4500,
        coupon_waived_delivery_cents=0,
        promo_free_shipping=False,
    ) == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend && . .venv/bin/activate && python -m pytest tests/modules/test_order_delivery_fee.py -v
```

Expected: FAIL (module missing)

- [ ] **Step 3: Add helper module and wire `create_public`**

Create `backend/app/modules/orders/delivery_fee.py`:

```python
def customer_payable_delivery_cents(delivery_fee_cents: int, waived_delivery_cents: int) -> int:
    return max(0, delivery_fee_cents - max(0, waived_delivery_cents))


def resolve_delivery_waiver_cents(
    *,
    delivery_fee_cents: int,
    coupon_waived_delivery_cents: int,
    promo_free_shipping: bool,
) -> int:
    if coupon_waived_delivery_cents > 0:
        return min(delivery_fee_cents, coupon_waived_delivery_cents)
    if promo_free_shipping and delivery_fee_cents > 0:
        return delivery_fee_cents
    return 0


def provider_quoted_fee_cents(delivery_fee_cents: int, waived_delivery_cents: int) -> int:
    """B2B fee for dispatch lock, including historical bug fallback."""
    if delivery_fee_cents > 0:
        return delivery_fee_cents
    if waived_delivery_cents > 0:
        return waived_delivery_cents
    return 0
```

In `_build_priced_order`, include `quote.applied_free_shipping_promotion_id` in the return tuple.

In `create_public`:
1. Keep `delivery_fee_cents` from input (do not overwrite with coupon’s “zero”).
2. After coupon apply: take `coupon_waived` from `applied.waived_delivery_cents` but **keep** the pre-coupon delivery fee as the order fee (`delivery_fee_cents` stays the input fee / applied.delivery_fee from Task 1 which equals input).
3. `waived = resolve_delivery_waiver_cents(delivery_fee_cents=..., coupon_waived_delivery_cents=..., promo_free_shipping=bool(applied_free_shipping_promotion_id) and data.type == "delivery")`
4. `order_total = lines_total + customer_payable_delivery_cents(delivery_fee_cents, waived)`
5. Persist `delivery_fee_cents` (real) and `coupon_waived_delivery_cents=waived`.

Important: when applying coupon, set:

```python
lines_total = applied.food_total_cents
# keep real fee
delivery_fee_cents = applied.delivery_fee_cents  # Task 1 keeps this real
coupon_waived_from_coupon = applied.waived_delivery_cents
```

Then merge promo waiver via `resolve_delivery_waiver_cents`.

- [ ] **Step 4: Run helper tests**

Run:

```bash
cd backend && . .venv/bin/activate && python -m pytest tests/modules/test_order_delivery_fee.py -q
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/orders/delivery_fee.py backend/app/modules/orders/service.py backend/tests/modules/test_order_delivery_fee.py
git commit -m "fix(orders): charge customer fee minus waiver; keep provider fee"
```

---

### Task 3: Public cart quote — real fee + top-level waived

**Files:**
- Modify: `backend/app/modules/public/schemas.py` (`CartQuoteDTO`)
- Modify: `backend/app/modules/public/api.py` (`quote_public_cart`)
- Test: `backend/tests/api/test_public_coupon_quote.py`
- Test: add/adjust promo free-shipping quote test if one exists; else add in same file or `test_public_cart_quote_free_shipping_promo.py`

**Interfaces:**
- Consumes: Task 1 compose result (`delivery_fee_cents` real, coupon waived)
- Produces: `CartQuoteDTO.waived_delivery_cents: int = 0` and `delivery_fee_cents` always the real input fee when provided

- [ ] **Step 1: Write / update failing API expectations**

For coupon free shipping quote with `delivery_fee_cents: 4500`, assert:

```python
assert body["delivery_fee_cents"] == 4500
assert body["waived_delivery_cents"] == 4500
assert body["coupon"]["waived_delivery_cents"] == 4500
assert body["total_cents"] == <food only>
```

For promo free shipping (seed a free_shipping promo + cart over min_order), assert same pattern without requiring a coupon:

```python
assert body["delivery_fee_cents"] == 4500
assert body["waived_delivery_cents"] == 4500
assert body["applied_free_shipping_promotion_id"] is not None
```

Remove the code path expectation that quote returns `delivery_fee_cents == 0`.

- [ ] **Step 2: Run tests to verify they fail**

Run relevant pytest nodes; expect FAIL on fee/waived fields.

- [ ] **Step 3: Implement schema + API**

Add to `CartQuoteDTO`:

```python
waived_delivery_cents: int = 0
```

In `quote_public_cart`:
1. Delete the block that sets `delivery_fee_input = 0` when `applied_free_shipping_promotion_id` is set.
2. After compose:

```python
waived = 0
if composed.coupon is not None:
    waived = max(waived, composed.coupon.waived_delivery_cents)
if (
    quote.applied_free_shipping_promotion_id is not None
    and data.service_type == "delivery"
):
    waived = max(waived, max(data.delivery_fee_cents, 0))
# never exceed fee
fee = composed.delivery_fee_cents  # real after Task 1
waived = min(fee, waived)
```

3. Return `delivery_fee_cents=fee`, `waived_delivery_cents=waived`, `total_cents=composed.food_total_cents`.

- [ ] **Step 4: Run tests**

```bash
cd backend && . .venv/bin/activate && python -m pytest tests/api/test_public_coupon_quote.py -q
```

Expected: PASS (plus any new promo quote test)

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/public/schemas.py backend/app/modules/public/api.py backend/tests/api/test_public_coupon_quote.py
git commit -m "fix(public): expose real delivery fee and waived amount on cart quote"
```

---

### Task 4: Dispatch lock uses provider fee (+ historical fallback)

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/service.py` (~948–964)
- Test: `backend/tests/api/test_restaurant_dispatch_requests.py` (`test_create_dispatch_from_order_reuses_display_id_and_quoted_fee` and a new historical case)

**Interfaces:**
- Consumes: `provider_quoted_fee_cents` from `app.modules.orders.delivery_fee`
- Produces: `quoted_fee_cents` never stuck at 0 when waived preserved the real tariff

- [ ] **Step 1: Write failing historical fallback test**

Add API test (or module test) that creates/seeds an order with `delivery_fee_cents=0`, `coupon_waived_delivery_cents=7777`, same dropoff, creates dispatch, asserts `quoted_fee_cents == 7777`.

Also keep the existing test where order has `delivery_fee_cents=7777` → still locks 7777.

- [ ] **Step 2: Run test to verify fail** (historical case returns 0 today)

- [ ] **Step 3: Implement lock**

```python
from app.modules.orders.delivery_fee import provider_quoted_fee_cents

if lock_quoted_fee:
    assert source_order is not None
    quoted_fee_cents = provider_quoted_fee_cents(
        source_order.delivery_fee_cents,
        getattr(source_order, "coupon_waived_delivery_cents", 0) or 0,
    )
else:
    ...
```

- [ ] **Step 4: Run dispatch tests**

```bash
cd backend && . .venv/bin/activate && python -m pytest tests/api/test_restaurant_dispatch_requests.py -q
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/delivery_dispatch/service.py backend/tests/api/test_restaurant_dispatch_requests.py
git commit -m "fix(dispatch): lock provider fee from order fee or historical waiver"
```

---

### Task 5: Frontend shared delivery fee helpers + kitchen totals

**Files:**
- Create: `frontend/src/lib/orders/deliveryFee.ts`
- Create: `frontend/src/lib/orders/deliveryFee.test.ts`
- Modify: `frontend/src/lib/orders/orderDisplay.ts`
- Modify: `frontend/src/lib/orders/orderDisplay.test.ts`
- Modify: `frontend/src/components/orders/KitchenOrdersView.tsx` (totals rows only)

**Interfaces:**
- Produces:

```ts
export function customerPayableDeliveryCents(deliveryFeeCents: number, waivedCents: number): number
export function providerDeliveryFeeCents(deliveryFeeCents: number, waivedCents: number): number
```

- [ ] **Step 1: Write failing frontend unit tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { customerPayableDeliveryCents, providerDeliveryFeeCents } from './deliveryFee.ts';

test('customer payable is zero when waived equals fee', () => {
  assert.equal(customerPayableDeliveryCents(4500, 4500), 0);
});

test('provider fee falls back to waived for legacy orders', () => {
  assert.equal(providerDeliveryFeeCents(0, 4500), 4500);
  assert.equal(providerDeliveryFeeCents(4500, 4500), 4500);
});
```

Update `buildOrderTotalsBreakdown` tests: when `delivery_fee_cents=4500` and `coupon_waived_delivery_cents=4500`, customer-facing delivery due is 0 (add field `customerDeliveryFeeCents` or change how `deliveryFeeCents` is interpreted in kitchen — prefer adding `customerDeliveryFeeCents` and `providerDeliveryFeeCents` on the breakdown to avoid ambiguity).

- [ ] **Step 2: Run tests — expect fail**

```bash
cd frontend && pnpm exec tsx --test src/lib/orders/deliveryFee.test.ts
```

- [ ] **Step 3: Implement helpers + wire orderDisplay + KitchenOrdersView**

- Breakdown exposes:
  - `providerDeliveryFeeCents` = `providerDeliveryFeeCents(order.delivery_fee_cents, order.coupon_waived_delivery_cents)`
  - `customerDeliveryFeeCents` = `customerPayableDeliveryCents(...)`
  - Keep `deliveryFeeCents` as alias of **customer** due for minimal kitchen churn, **or** update kitchen to use the new names explicitly (prefer explicit names).

Kitchen:
- Envío row: show customer due; if waived > 0 show “Envío gratis” / $0 for customer.
- Coupon/promo absorption: show waived amount as restaurant absorption (existing coupon row already shows “Envío gratis”).

- [ ] **Step 4: Run tests — expect pass**

```bash
cd frontend && pnpm exec tsx --test src/lib/orders/deliveryFee.test.ts src/lib/orders/orderDisplay.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/orders/deliveryFee.ts frontend/src/lib/orders/deliveryFee.test.ts frontend/src/lib/orders/orderDisplay.ts frontend/src/lib/orders/orderDisplay.test.ts frontend/src/components/orders/KitchenOrdersView.tsx
git commit -m "fix(orders-ui): separate customer vs provider delivery fee display"
```

---

### Task 6: RequestDeliveryForm locks B2B fee

**Files:**
- Modify: `frontend/src/components/dispatch/RequestDeliveryForm.tsx`
- Test: `frontend/src/lib/orders/kitchenDispatch.test.ts` if fee lock is covered there; else add a small pure helper test for locked fee selection using `providerDeliveryFeeCents`

**Interfaces:**
- Consumes: `providerDeliveryFeeCents` from Task 5

- [ ] **Step 1: Update lockedOrigin fee**

```ts
import { providerDeliveryFeeCents } from '@/lib/orders/deliveryFee';

feeCents: providerDeliveryFeeCents(
  sourceOrder.delivery_fee_cents,
  sourceOrder.coupon_waived_delivery_cents ?? 0,
),
```

Change help copy from “Tarifa que vio el cliente...” to something accurate, e.g.:

`Tarifa del servicio de delivery. Se recalcula solo si mueves el pin o cambias la dirección.`

If the restaurant absorbed shipping, optional second line: `El cliente no pagó envío; el restaurante absorbe este costo.` when waived > 0.

- [ ] **Step 2: Run related frontend tests**

```bash
cd frontend && pnpm exec tsx --test src/lib/orders/kitchenDispatch.test.ts src/lib/orders/deliveryFee.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dispatch/RequestDeliveryForm.tsx
git commit -m "fix(dispatch-ui): lock provider delivery fee, not customer-paid fee"
```

---

### Task 7: Live menu checkout + WhatsApp use waived for customer due

**Files:**
- Modify: `frontend/src/lib/api/public.ts` (`CartQuote` type: add `waived_delivery_cents?: number`)
- Modify: `frontend/src/components/digital-menu/PublicMenuCheckoutSummary.tsx`
- Modify: `frontend/src/lib/digital-menu/checkout/formatWhatsAppOrderMessage.ts`
- Modify: `frontend/src/lib/digital-menu/checkout/formatWhatsAppOrderMessage.test.ts`
- Modify: `frontend/src/lib/digital-menu/checkout/buildPublicOrderInput.ts` only if needed to always send real fee (fulfillment must keep real fee)

**Interfaces:**
- Consumes: quote `delivery_fee_cents` (real) + `waived_delivery_cents` (top-level) and/or coupon waived
- Produces: `customerDue = max(0, fee - waived)` for totals; order payload still sends real fee via `fulfillment.deliveryFeeCents`

- [ ] **Step 1: Write failing WhatsApp / checkout unit expectations**

When quote has `delivery_fee_cents: 4500` and `waived_delivery_cents: 4500` (or coupon waived), customer message/total must not add $45 shipping as payable.

Update `PublicMenuCheckoutSummary` logic:

```ts
const providerFeeCents = quote.delivery_fee_cents ?? fulfillment.deliveryFeeCents ?? 0;
const waivedCents = Math.max(
  quote.waived_delivery_cents ?? 0,
  quote.coupon?.waived_delivery_cents ?? 0,
);
const deliveryFeeWaived = fulfillment.serviceType === 'delivery' && waivedCents > 0;
const customerDeliveryFeeCents = Math.max(0, providerFeeCents - waivedCents);
const orderTotalCents = quote.total_cents + customerDeliveryFeeCents;
```

Display “Envío gratis” when waived; pass `deliveryFee={customerDeliveryFeeCents/100}` into totals (or keep showing strikethrough provider fee only if product already does — prefer customer due + free label).

Ensure `fulfillment.deliveryFeeCents` remains the **provider** fee from the delivery quote API (not zeroed by cart quote). Cart quote waived must not overwrite fulfillment’s real fee used in `buildPublicOrderInput`.

- [ ] **Step 2: Run tests**

```bash
cd frontend && pnpm exec tsx --test src/lib/digital-menu/checkout/formatWhatsAppOrderMessage.test.ts src/lib/digital-menu/cart/cartQuotePayload.test.ts
```

- [ ] **Step 3: Fix until green; commit**

```bash
git add frontend/src/lib/api/public.ts frontend/src/components/digital-menu/PublicMenuCheckoutSummary.tsx frontend/src/lib/digital-menu/checkout/formatWhatsAppOrderMessage.ts frontend/src/lib/digital-menu/checkout/formatWhatsAppOrderMessage.test.ts
git commit -m "fix(live-menu): customer pays fee minus waiver; keep real fee for orders"
```

---

### Task 8: Ticket print + end-to-end sanity

**Files:**
- Modify: `frontend/src/lib/print/ticketDocument.ts` / `.test.ts` if ticket currently hides delivery when fee is real but waived
- Smoke: manual checklist in commit message / PR notes

- [ ] **Step 1: Adjust ticket tests**

Order with `delivery_fee_cents=3500`, `coupon_waived_delivery_cents=3500` should print customer shipping as free / $0, not charge 3500.

- [ ] **Step 2: Run ticket + orderDisplay tests**

```bash
cd frontend && pnpm exec tsx --test src/lib/print/ticketDocument.test.ts src/lib/orders/orderDisplay.test.ts
```

- [ ] **Step 3: Run backend regression suite for coupons/orders/dispatch**

```bash
cd backend && . .venv/bin/activate && python -m pytest tests/modules/test_coupon_pricing.py tests/modules/test_coupon_quote_compose.py tests/modules/test_order_delivery_fee.py tests/api/test_public_coupon_quote.py tests/api/test_restaurant_dispatch_requests.py -q
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/print/ticketDocument.ts frontend/src/lib/print/ticketDocument.test.ts
git commit -m "fix(print): show free shipping to customer when delivery is waived"
```

- [ ] **Step 5: Mark spec status**

Update first line of `docs/superpowers/specs/2026-09-03-free-shipping-b2b-fee-design.es.md` status to `implemented` (or `in progress` until manual verify). Commit docs if changed.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Coupon keeps real fee + waived | 1, 2 |
| Promo free shipping same money model | 2, 3, 7 |
| Quote returns real fee + waived | 3 |
| Customer total excludes waived fee | 2, 5, 7, 8 |
| Dispatch lock uses real fee | 4 |
| Historical fallback fee\|\|waived | 4, 5, 6 |
| Kitchen / RequestDeliveryForm copy | 5, 6 |
| WhatsApp / ticket customer-facing | 7, 8 |
| Pickup + free shipping coupon still rejected | 1 (existing test unchanged) |
| Delivery dashboard | No code task (fed by quoted_fee) |

## Manual verify (after Task 8)

1. Create order with coupon `ENVIOGRATIS` and real delivery quote > 0.
2. Kitchen: customer total without shipping; coupon shows envío gratis.
3. Pedir repartidor: locked fee > 0.
4. Delivery dashboard / monitor: `quoted_fee_cents` > 0.
5. Repeat with a free-shipping promotion (no coupon).

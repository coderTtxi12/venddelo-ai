# Promotions Enhancement Plan

> Roadmap to complete promotion logic beyond the current MVP: server-side validity, recurring schedules (e.g. “Wednesday 2×1 on burgers”), order-level discounts, and checkout integration.
>
> **Related docs:** `PROJECT_PLANNING.en.md`, `TECH_ARCHITECTURE.en.md`, `superpowers/specs/2026-06-14-phase-4-domain-services-api-design.md`

---

## 1. Current state (as of 2026-06)

### What works today

| Area | Status |
|------|--------|
| Backend CRUD | Create, list, update, delete, attach products/categories |
| Marketing panel | Create manual promotions, delete |
| Catalog discounts | Product editor syncs `percent` / `amount` promotions scoped to a single product |
| Public menu display | `percent` and `amount` for **product** and **category** scope |
| Optional date range | `starts_at` / `ends_at` stored in Postgres (nullable) |

### What is incomplete or missing

| Gap | Impact |
|-----|--------|
| **Order scope** (`scope: order`) | Saved in DB but never applied in menu or cart |
| **Combo type** | Badge only; no pricing rules |
| **2×1 type** | Badge only; no buy-one-get-one math; DB constraint uses `two_for_one`, API uses `2x1` |
| **Recurring schedule** | No “every Wednesday” — only one-off datetime range |
| **Validity enforcement** | Frontend filters by date when showing discounts; backend lists all `is_active` rows |
| **Admin status UI** | Shows “Active” from `is_active`, not from dates or recurrence |
| **Checkout / orders** | Backend charges catalog price; promotions not applied server-side |
| **Edit promotion** | API supports PATCH; Marketing UI is create + delete only |

### Example that does **not** work end-to-end today

> “Wednesday 2×1 on burgers” — select Burgers category, type 2×1, recurring on Wednesdays.

- Category selection works at data level.
- 2×1 pricing does not.
- Weekday recurrence does not exist.
- Even a one-off 20% on Burgers works in the menu, but not if scope is **order**.

---

## 2. Design principles

1. **Server is the source of truth** for “is this promotion active now?” and for final prices on orders.
2. **Never rely on the client clock** for security-sensitive rules (expired promos, recurring windows).
3. **Cron jobs are optional** for admin UX and housekeeping — not the primary enforcement mechanism.
4. **Reuse patterns** from `restaurant_schedules` (`day_of_week`, time windows, restaurant timezone).
5. **Phased delivery** — ship server-side date filtering and order discounts before advanced recurrence.

---

## 3. Validity: dates and status

### Problem

- `ends_at` is stored but `is_active` stays `true` after expiry.
- Public API returns promotions where `is_active = true` only — no date filter.
- Menu applies date checks in the frontend (`menuProductDiscount.ts`), which can be bypassed if the device clock is wrong.

### Recommended approach

**Primary: evaluate at read time and at checkout (backend clock + restaurant timezone).**

```python
def is_promotion_effective(promo, now: datetime, tz: ZoneInfo) -> bool:
    if not promo.is_active:
        return False
    local_now = now.astimezone(tz)
    if promo.starts_at and promo.starts_at > local_now:
        return False
    if promo.ends_at and promo.ends_at <= local_now:
        return False
    if promo.recurrence and not recurrence_matches(promo.recurrence, local_now):
        return False
    return True
```

Apply in:

- `PromotionService.list_active` (authenticated + public endpoints)
- Order pricing service when computing totals
- Optional shared module: `app/modules/promotions/effective.py`

**Secondary (optional): cron for admin cleanliness**

- Nightly job: soft-delete or flag promotions where `ends_at < now()` and no recurrence.
- Purpose: Marketing table shows “Expired” instead of “Active”.
- **Not** required for customer-facing correctness if read-time filtering exists.

### Admin UI status column

Derive display status from server rules, not raw `is_active` alone:

| Display | Rule |
|---------|------|
| Scheduled | `starts_at` in the future |
| Active | Effective now |
| Expired | Past `ends_at` (and no recurrence) |
| Inactive | `is_active = false` (manual delete) |

---

## 4. Recurring promotions (e.g. “every Wednesday”)

### Use cases (priority order)

1. Specific weekdays — “Wednesdays 2×1 on Burgers”
2. Weekdays + time window — “Friday 17:00–20:00 happy hour”
3. One-off date range — already supported via `starts_at` / `ends_at`
4. **Defer:** “every N days” — low demand, confusing UX; skip in v1

### Data model proposal

Add to `promotions` table (choose one):

**Option A — JSONB `recurrence` (flexible, matches existing planning doc)**

```json
{
  "weekdays": [3],
  "start_time": "00:00",
  "end_time": "23:59"
}
```

- `weekdays`: `0–6` (Mon–Sun or Sun–Sat — document convention; align with `restaurant_schedules.day_of_week`).
- Empty or null `weekdays` → no weekday restriction (only `starts_at` / `ends_at` apply).
- Optional `start_time` / `end_time` for intraday windows.

**Option B — normalized `promotion_recurrence` table** — only if many complex rules later.

**Timezone:** use restaurant timezone (add `timezone` on `restaurants` if missing; fallback `America/Mexico_City`).

### Evaluation logic

- Convert `now` to restaurant local time.
- If `recurrence.weekdays` is set → `local_now.weekday()` must be in list.
- If `start_time` / `end_time` set → `local_now.time()` must fall in window (handle overnight spans if needed later).

### Frontend (Marketing panel)

Add section **“Schedule”** below optional start/end dates:

| Control | Purpose |
|---------|---------|
| Mode toggle | **Always** (no weekday filter) / **Specific days** |
| Weekday multi-select | L M T W T F S chips (reuse schedule editor UX from onboarding) |
| Optional time range | From / To (local restaurant time) |
| Help text | “Applies every selected day within the optional time window” |

Keep **start/end dates** for campaign boundaries (“this promo only runs June–August, but only on Wednesdays inside that range”).

---

## 5. Promotion types — complete behavior

### 5.1 Percent / amount (product & category)

**Status:** mostly done for menu display.

**Remaining work:**

- Move discount resolution to backend endpoint or include computed prices in public menu payload.
- Apply same rules in order creation.

### 5.2 Order scope (`scope: order`)

Example: 10% off entire order if subtotal ≥ MXN 200.

**Rules:**

- `min_order_cents` already exists — enforce on subtotal after line items, before order discount.
- Apply once per order (best eligible order promo or stack policy — **recommend: single best order promo** for v1).

**Cart UI:**

- Show subtotal, order discount line, total.
- Recalculate when lines change.

**Backend:**

- `OrderService._build_order_items` → add promotion engine step.
- Store `discount_cents`, `applied_promotion_id` on `orders` (schema migration).

### 5.3 Two-for-one (`type: two_for_one`)

Align naming: API accepts `2x1`, DB stores `two_for_one`, DTO maps consistently.

**Rules (v1):**

- Scope: product or category.
- For each eligible line: every 2 units → pay for 1 (cheapest free unit policy or same-SKU only — **document: same product line, floor(quantity / 2) free units**).

**Menu:**

- Badge `2×1`.
- Detail text: “Add 2 to get the offer.”

**Cart / order:**

- Adjust `line_total_cents` server-side; never trust client unit price alone.

### 5.4 Combo

**Defer full combo engine** until product bundling rules are defined (fixed bundle SKU vs pick-N-from-set).

**v1:** either hide Combo in Marketing UI or show with clear “coming soon” if selected.

---

## 6. Scope selection (products vs categories)

| Scope | When to use |
|-------|-------------|
| **Category** | “All burgers” — select Burgers checkbox (current UI) |
| **Product** | 2×1 on specific items only |
| **Order** | Whole-cart discount with optional `min_order_cents` |

For “Wednesday 2×1 on hamburgers”: **category = Burgers**, **type = 2×1**, **recurrence = Wednesday**.

---

## 7. Security model

| Threat | Mitigation |
|--------|------------|
| Wrong phone clock shows expired promo | Backend filters before API response; re-validates on order |
| Tampered cart prices | Order API recalculates from catalog + promotion engine |
| Direct API abuse | Authenticated admin routes unchanged; public order endpoint uses server pricing only |

Frontend date checks may remain as a **display optimization** but must not be the only gate.

---

## 8. Implementation phases

### Phase A — Server-side validity (1–2 days)

- [ ] Shared `is_promotion_effective()` in backend
- [ ] Filter in `list_active` and public promotions endpoint
- [ ] Marketing UI: derived status (Active / Scheduled / Expired)
- [ ] Tests: timezone, `starts_at`, `ends_at` boundaries

### Phase B — Order-level discounts (3–5 days)

- [ ] Promotion engine module for order scope (`percent`, `amount`)
- [ ] Cart UI: order discount row
- [ ] Order schema: `discount_cents`, optional `promotion_id`
- [ ] `OrderService.create_public` applies promotions server-side
- [ ] Tests: min order threshold, expired promo rejected

### Phase C — Recurring schedule (3–4 days)

- [ ] Alembic: `recurrence JSONB` on `promotions` (+ restaurant `timezone` if needed)
- [ ] Backend recurrence evaluator + tests (Wednesdays, happy hour window)
- [ ] Marketing UI: weekday multi-select + optional time range
- [ ] Public API includes only effective promos

### Phase D — 2×1 pricing (3–5 days)

- [ ] Unify `2x1` / `two_for_one` in API and DB
- [ ] Line-level 2×1 math in promotion engine
- [ ] Menu badge + cart quantity hints
- [ ] Order snapshot stores applied 2×1 breakdown

### Phase E — Admin polish (2–3 days)

- [ ] Edit promotion (PATCH) in Marketing UI
- [ ] Optional nightly cron to mark long-expired promos inactive (housekeeping)
- [ ] Align catalog auto-promotions with new effective rules

### Phase F — Combo (future)

- [ ] Product bundle model and combo pricing rules
- [ ] Enable Combo type in UI

---

## 9. API sketch ( additions )

```yaml
PromotionCreate:
  recurrence:
    weekdays: [3]           # optional; 0=Mon … 6=Sun (document convention)
    start_time: "17:00"     # optional, local restaurant time
    end_time: "20:00"       # optional

PromotionDTO:
  effective_status: scheduled | active | expired | inactive  # computed, read-only

PublicOrderInput:
  # no promotion_id from client in v1 — server picks best eligible order promo
  # OR optional promo_code later for discount codes
```

---

## 10. Testing checklist

- [ ] Promo with `ends_at` in the past → not returned by public API
- [ ] Promo with `starts_at` in the future → status “Scheduled”, not applied
- [ ] Wednesday recurrence active only on Wednesday (restaurant TZ)
- [ ] Order 10% with `min_order_cents` — below threshold: no discount; above: applied
- [ ] 2×1: qty 1 full price, qty 2 pays 1, qty 3 pays 2
- [ ] Client sends manipulated `unit_price_cents` → order API ignores and recalculates
- [ ] Expired promo at order time → 400 with clear error

---

## 11. Out of scope (for this plan)

- Discount **codes** (`PRIMERA-COMPRA`) — separate feature; can share promotion engine later
- “Publish in menu” toggle — separate visibility flag if needed
- Usage limits (`0 / ∞`) — requires redemption counters
- Stacking multiple promos on one line — v1: best single discount wins

---

## 12. Summary

| Question | Answer |
|----------|--------|
| Cron to deactivate? | Optional for admin UX; **not** the main enforcement |
| Frontend-only date check? | **Insufficient** — device clock can bypass |
| “Every Wednesday” in UI? | **Yes** — weekday multi-select + optional time; rules on backend |
| “Every 3 days”? | **Defer** — not worth v1 complexity |
| Wednesday 2×1 on burgers? | Category Burgers + type 2×1 + recurrence Wednesday + server-side cart/order math |

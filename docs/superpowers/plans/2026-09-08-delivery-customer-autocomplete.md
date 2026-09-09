# Delivery Customer Autocomplete Implementation Plan

> **For agentic workers:** Implement task-by-task. No git commits unless the user asks. Stay on the current branch.

**Goal:** Autocomplete nombre/celular en el form de `/delivery` con fuzzy match y autofill del último envío (sin montos).

**Architecture:** Fuzzy en `matches_query`; snapshot `last_delivery` en customer activity; combobox en `RequestDeliveryForm` con debounce → list customers → hydrate on select.

**Tech Stack:** FastAPI/Python customers module, Next.js React form, CSS modules.

## Global Constraints

- No commits / no new branch.
- Do not autofill collect amounts or cash denomination.
- Mobile-first, touch targets ≥44px.
- Reuse existing customers APIs where possible.

---

### Task 1: Fuzzy `matches_query` + tests

**Files:**
- Modify: `backend/app/modules/customers/grouping.py`
- Modify: `backend/tests/modules/test_customer_phone.py`

- [ ] Add failing tests for accent-insensitive + typo match (e.g. `marai` → María, `guadlupe` → Guadalupe)
- [ ] Implement normalize + SequenceMatcher fuzzy (≥0.7) while keeping substring/digit matches
- [ ] Rank exact/substring before fuzzy when sorting filtered results (or score within filter)
- [ ] Run tests

### Task 2: `last_delivery` snapshot on activity

**Files:**
- Modify: `backend/app/modules/customers/schemas.py`
- Modify: `backend/app/modules/customers/adapters.py` (+ grouping helpers as needed)
- Modify: `backend/app/modules/customers/grouping.py` (address/ref split, prep minutes)
- Modify: `backend/tests/api/test_restaurant_customers.py` and/or module tests

- [ ] Add `CustomerLastDelivery` schema fields
- [ ] Load payment_method, package_size, package_count, ready_at/created_at, lat/lng from dispatch rows
- [ ] Build `last_delivery` preferring latest delivery dispatch; split refs (` · ` and `\nReferencias:`)
- [ ] Tests green

### Task 3: Frontend API types + address split

**Files:**
- Modify: `frontend/src/lib/api/customers.ts`
- Modify: `frontend/src/lib/orders/kitchenDispatch.ts` (+ test)

- [ ] Types for `last_delivery`
- [ ] Extend `splitDeliveryAddress` for ` · ` separator
- [ ] Tests for both ref formats

### Task 4: Suggest UI + wire RequestDeliveryForm

**Files:**
- Create: `frontend/src/components/dispatch/CustomerSuggestInput.tsx` (+ `.module.css` if needed)
- Modify: `frontend/src/components/dispatch/RequestDeliveryForm.tsx` (+ CSS)
- Possibly: small hook under `frontend/src/lib/customers/`

- [ ] Debounced search (≥2 chars) via `listRestaurantCustomers`
- [ ] Combobox on name + phone fields
- [ ] On select: fetch activity, apply `last_delivery` to form (skip amounts)
- [ ] Mobile-first styles; brief “Cliente cargado” feedback
- [ ] Manual smoke on `/delivery`

### Task 5: Verification

- [ ] Backend customer tests pass
- [ ] Frontend kitchenDispatch / related unit tests pass
- [ ] ui-ux checklist: touch targets, list overflow, keyboard dismiss

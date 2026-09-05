# Promo / Coupon Pause Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let restaurant admins pause/reactivate promotions and coupons from `/promociones` and `/cupones` list UIs via a controlled switch, with pause distinct from soft-delete.

**Architecture:** Reuse `is_active` as reversible pause (same as coupons). Align promotions repo so admin list filters by `deleted_at IS NULL`, soft-delete sets `deleted_at`, and PATCH can flip `is_active`. Frontend adds a shared `ActivePauseSwitch` on list cards/tables; pending state until API responds; no toast/modal.

**Tech Stack:** FastAPI, SQLAlchemy, pytest; Next.js frontend, CSS modules, MUI IconButtons, `node --import tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-05-promo-coupon-pause-switch-design.es.md`

## Global Constraints

- Pause ≠ soft-delete; paused items stay in admin list
- Switch only on list (cards + desktop table); not in forms
- Controlled + pending (no optimistic UI); no toast/modal; inline `role="alert"` on error
- Pill copy **Pausada** for `effective_status === 'inactive'`
- Mobile-first: touch target ≥44px; `stopPropagation` on switch
- Spanish UI copy
- Do not revert unrelated local WIP on `PromotionsPage` / `PromotionListCard` unless it blocks the switch

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/modules/promotions/schemas.py` | `is_active` on `PromotionUpdate` |
| `backend/app/modules/promotions/repository.py` | Add `list_for_admin` |
| `backend/app/modules/promotions/adapters.py` | `deleted_at` gates; admin list; pause-safe update |
| `backend/app/modules/promotions/service.py` | Admin list uses `list_for_admin` |
| `backend/app/modules/assistant/skills/promotions/tools.py` | `disable_promotion` pauses (PATCH), not soft-delete |
| `backend/app/modules/assistant/skills/promotions/SKILL.md` | Doc: disable = pause |
| `backend/tests/modules/test_promotions_repo.py` | Pause vs soft-delete list/get/update |
| `backend/tests/modules/test_promotions_tools.py` | Disabled promo still listed; `is_active=false` |
| `frontend/src/lib/api/promotions.ts` | Allow `is_active` in update payload |
| `frontend/src/lib/promotions/display.ts` (+ test) | Label **Pausada** |
| `frontend/src/lib/coupons/display.ts` (+ test) | Label **Pausada** |
| `frontend/src/components/ui/ActivePauseSwitch.tsx` (+ css) | Shared switch |
| `frontend/src/components/promotions/PromotionListCard.tsx` | Wire switch |
| `frontend/src/components/coupons/CouponListCard.tsx` | Wire switch |
| `frontend/src/components/pages/PromotionsPage.tsx` | Handler + table switch |
| `frontend/src/components/pages/CouponsPage.tsx` | Handler + table switch |
| Page CSS modules | Card paused opacity, alert, action gap |

---

### Task 1: Promotions repo — pause vs soft-delete

**Files:**
- Modify: `backend/app/modules/promotions/schemas.py`
- Modify: `backend/app/modules/promotions/repository.py`
- Modify: `backend/app/modules/promotions/adapters.py`
- Modify: `backend/app/modules/promotions/service.py`
- Modify: `backend/tests/modules/test_promotions_repo.py`

**Interfaces:**
- Consumes: existing `Promotion`, `SoftDeleteMixin` (`is_active`, `deleted_at`)
- Produces:
  - `PromotionUpdate.is_active: bool | None = None`
  - `PromotionRepository.list_for_admin(restaurant_id, params) -> CursorPage[PromotionDTO]`
  - `get` / `update` / `soft_delete` treat soft-delete via `deleted_at is not None`
  - `list_active` remains `deleted_at IS NULL AND is_active IS TRUE` (or equivalent: keep filtering `is_active.is_(True)` which already excludes soft-deleted and paused)

- [ ] **Step 1: Write failing repo tests**

Append to `backend/tests/modules/test_promotions_repo.py`:

```python
from app.modules.promotions.schemas import PromotionUpdate


@requires_db
def test_list_for_admin_includes_paused_excludes_soft_deleted(session):
    r = _restaurant(session, "promo-pause-list")
    repo = SqlAlchemyPromotionRepository(session)
    live = repo.add(
        PromotionCreate(restaurant_id=r.id, name="live", type="percent", scope="order", percent=10)
    )
    paused = repo.add(
        PromotionCreate(restaurant_id=r.id, name="paused", type="percent", scope="order", percent=10)
    )
    gone = repo.add(
        PromotionCreate(restaurant_id=r.id, name="gone", type="percent", scope="order", percent=10)
    )
    assert repo.update(paused.id, PromotionUpdate(is_active=False)) is not None
    assert repo.soft_delete(gone.id) is True

    admin_ids = {p.id for p in repo.list_for_admin(r.id, PaginationParams(limit=20)).items}
    assert live.id in admin_ids
    assert paused.id in admin_ids
    assert gone.id not in admin_ids

    active_ids = {p.id for p in repo.list_active(r.id, PaginationParams(limit=20)).items}
    assert live.id in active_ids
    assert paused.id not in active_ids
    assert gone.id not in active_ids


@requires_db
def test_pause_then_reactivate_and_get(session):
    r = _restaurant(session, "promo-pause-toggle")
    repo = SqlAlchemyPromotionRepository(session)
    promo = repo.add(
        PromotionCreate(restaurant_id=r.id, name="toggle", type="percent", scope="order", percent=15)
    )
    paused = repo.update(promo.id, PromotionUpdate(is_active=False))
    assert paused is not None
    assert paused.is_active is False
    assert repo.get(promo.id) is not None
    assert repo.get(promo.id).is_active is False

    active = repo.update(promo.id, PromotionUpdate(is_active=True))
    assert active is not None
    assert active.is_active is True


@requires_db
def test_soft_deleted_not_gettable_or_updatable(session):
    r = _restaurant(session, "promo-soft-gone")
    repo = SqlAlchemyPromotionRepository(session)
    promo = repo.add(
        PromotionCreate(restaurant_id=r.id, name="gone", type="percent", scope="order", percent=10)
    )
    assert repo.soft_delete(promo.id) is True
    assert repo.get(promo.id) is None
    assert repo.update(promo.id, PromotionUpdate(name="x")) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/modules/test_promotions_repo.py::test_list_for_admin_includes_paused_excludes_soft_deleted tests/modules/test_promotions_repo.py::test_pause_then_reactivate_and_get tests/modules/test_promotions_repo.py::test_soft_deleted_not_gettable_or_updatable -v`

Expected: FAIL (missing `list_for_admin` and/or `PromotionUpdate.is_active` / get gates)

- [ ] **Step 3: Implement schema + repository + adapter + service**

In `PromotionUpdate` add:

```python
is_active: bool | None = None
```

In `PromotionRepository` add abstract:

```python
def list_for_admin(
    self, restaurant_id: uuid.UUID, params: PaginationParams
) -> CursorPage[PromotionDTO]: ...
```

In `SqlAlchemyPromotionRepository`:

1. `get` / `update` / `soft_delete`: gate on `obj.deleted_at is not None` (not `not obj.is_active`).
2. `list_for_admin`: same cursor pagination as `list_active`, but `Promotion.deleted_at.is_(None)` only (include paused).
3. Keep `list_active` as `Promotion.is_active.is_(True)` (excludes paused + soft-deleted).
4. `_storage_fields_from_update` already dumps unset-excluded fields — `is_active` will flow once on the schema.

In `PromotionService.list_for_admin`:

```python
page = self._repo.list_for_admin(restaurant_id, params)
page.items = [self._with_status(item, timezone) for item in page.items]
return page
```

Leave `list_active` / `list_effective_public` on `_repo.list_active`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/modules/test_promotions_repo.py -v`

Expected: PASS (including existing + new)

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/promotions/schemas.py backend/app/modules/promotions/repository.py backend/app/modules/promotions/adapters.py backend/app/modules/promotions/service.py backend/tests/modules/test_promotions_repo.py
git commit -m "$(cat <<'EOF'
feat(promotions): separate pause (is_active) from soft-delete

Admin list includes paused promos; get/update use deleted_at; PATCH can flip is_active.
EOF
)"
```

---

### Task 2: `disable_promotion` pauses instead of soft-deleting

**Files:**
- Modify: `backend/app/modules/assistant/skills/promotions/tools.py`
- Modify: `backend/app/modules/assistant/skills/promotions/SKILL.md`
- Modify: `backend/tests/modules/test_promotions_tools.py`

**Interfaces:**
- Consumes: `PromotionService.update(..., PromotionUpdate(is_active=False), timezone=...)`
- Produces: tool still returns `{ promotion_id, is_active: False }`; admin `list_promotions` still includes the row

- [ ] **Step 1: Update failing expectation in tool test**

In `test_create_and_disable_marketing_promotion`, change `listed_after` assertion so the promo **is** present and `is_active` is false (read from list row or `get_promotion` if available). Replace:

```python
assert not any(row["id"] == promo["id"] for row in listed_after.data["promotions"])
```

with:

```python
row = next(r for r in listed_after.data["promotions"] if r["id"] == promo["id"])
assert row["is_active"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/modules/test_promotions_tools.py::test_create_and_disable_marketing_promotion -v`

Expected: FAIL (tool still soft-deletes → row missing → `StopIteration` / assert)

- [ ] **Step 3: Implement pause in tool + docs**

In `tools.py` `disable_promotion` branch:

- Change description to: pause promotion (`is_active=false`); does not soft-delete; use delete API for remove.
- Replace `promo_service.delete(...)` with:

```python
promo_service.update(
    ctx.restaurant_id,
    promotion_id,
    PromotionUpdate(is_active=False),
    timezone=ctx.uow.restaurants.get(ctx.restaurant_id).timezone
    if hasattr(ctx.uow.restaurants, "get")
    else "America/Mexico_City",
)
```

Prefer resolving timezone the same way other promo tools do in this file (search existing `timezone=` usages in `tools.py` / agent context). If restaurant timezone is already on `ctx` or fetched nearby, reuse that exact pattern — do not invent a new accessor.

Import `PromotionUpdate` if missing.

Update `SKILL.md`: “End campaign / pause” → `disable_promotion` sets `is_active=false` (still listed in admin); hard remove remains delete endpoint / soft-delete — never claim soft-delete for this tool.

- [ ] **Step 4: Run tool tests**

Run: `cd backend && python -m pytest tests/modules/test_promotions_tools.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/assistant/skills/promotions/tools.py backend/app/modules/assistant/skills/promotions/SKILL.md backend/tests/modules/test_promotions_tools.py
git commit -m "$(cat <<'EOF'
fix(assistant): make disable_promotion pause instead of soft-delete

Paused promos remain visible in admin lists with is_active=false.
EOF
)"
```

---

### Task 3: Frontend display labels — Pausada

**Files:**
- Modify: `frontend/src/lib/promotions/display.ts`
- Create: `frontend/src/lib/promotions/display.test.ts`
- Modify: `frontend/src/lib/coupons/display.ts`
- Modify: `frontend/src/lib/coupons/display.test.ts`

**Interfaces:**
- Produces: `promotionStatusLabel` / `couponStatusLabel` return `'Pausada'` for inactive pause state

- [ ] **Step 1: Write / update failing tests**

`frontend/src/lib/promotions/display.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { promotionStatusLabel } from './display.ts';
import type { Promotion } from '@/lib/api/types';

function base(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: '1',
    restaurant_id: 'r',
    name: 'Promo',
    image_path: null,
    show_banner: true,
    type: 'percent',
    scope: 'order',
    percent: 10,
    amount_cents: null,
    combo_price_cents: null,
    min_order_cents: null,
    starts_at: null,
    ends_at: null,
    is_active: true,
    created_at: '',
    updated_at: '',
    product_ids: [],
    category_ids: [],
    option_item_ids: [],
    effective_status: 'active',
    ...overrides,
  } as Promotion;
}

test('promotionStatusLabel paused', () => {
  assert.equal(
    promotionStatusLabel(base({ is_active: false, effective_status: 'inactive' })),
    'Pausada',
  );
});
```

Adjust `base()` fields to match the real `Promotion` type in `frontend/src/lib/api/types.ts` (include any required fields the type demands).

In `display.test.ts` for coupons, change:

```ts
assert.equal(couponStatusLabel('inactive'), 'Pausada');
```

- [ ] **Step 2: Run tests to verify fail**

Run: `cd frontend && node --import tsx --test src/lib/promotions/display.test.ts src/lib/coupons/display.test.ts`

Expected: FAIL on Pausada assertions

- [ ] **Step 3: Implement labels**

`promotionStatusLabel` — for inactive / `!is_active` fallback use `'Pausada'`:

```ts
if (promotion.effective_status === 'inactive') return 'Pausada';
// ... other statuses ...
return promotion.is_active ? 'Activa' : 'Pausada';
```

(Keep existing scheduled/expired/outside_schedule/active branches.)

`couponStatusLabel`:

```ts
if (status === 'inactive') return 'Pausada';
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd frontend && node --import tsx --test src/lib/promotions/display.test.ts src/lib/coupons/display.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/promotions/display.ts frontend/src/lib/promotions/display.test.ts frontend/src/lib/coupons/display.ts frontend/src/lib/coupons/display.test.ts
git commit -m "$(cat <<'EOF'
feat(marketing): label paused promos and coupons as Pausada

Align list status copy with reversible pause semantics.
EOF
)"
```

---

### Task 4: `ActivePauseSwitch` component

**Files:**
- Create: `frontend/src/components/ui/ActivePauseSwitch.tsx`
- Create: `frontend/src/components/ui/ActivePauseSwitch.module.css`

**Interfaces:**
- Produces:

```ts
export type ActivePauseSwitchProps = {
  checked: boolean;
  pending?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (next: boolean) => void;
};
```

- [ ] **Step 1: Create component + CSS**

`ActivePauseSwitch.tsx`:

```tsx
'use client';

import styles from './ActivePauseSwitch.module.css';

export type ActivePauseSwitchProps = {
  checked: boolean;
  pending?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (next: boolean) => void;
};

export function ActivePauseSwitch({
  checked,
  pending = false,
  disabled = false,
  ariaLabel,
  onChange,
}: ActivePauseSwitchProps) {
  const isDisabled = disabled || pending;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={pending || undefined}
      aria-label={ariaLabel}
      className={`${styles.switch} ${checked ? styles.switchOn : ''} ${pending ? styles.switchPending : ''}`}
      disabled={isDisabled}
      onClick={(event) => {
        event.stopPropagation();
        if (isDisabled) return;
        onChange(!checked);
      }}
    >
      <span className={styles.thumb} aria-hidden="true" />
    </button>
  );
}
```

CSS (mirror inventory switch sizes; tokens from dashboard):

```css
.switch {
  position: relative;
  width: 52px;
  min-width: 52px;
  height: 32px;
  min-height: 44px;
  flex-shrink: 0;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
}

.switch::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 32px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-text-secondary) 28%, var(--color-surface));
  transition: background 160ms ease;
}

.switchOn::before {
  background: var(--color-primary);
}

.thumb {
  position: absolute;
  top: 50%;
  left: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
  transform: translateY(-50%);
  transition: transform 160ms ease;
}

.switchOn .thumb {
  transform: translateY(-50%) translateX(20px);
}

.switchPending {
  opacity: 0.55;
}

.switch:disabled {
  cursor: not-allowed;
}

.switch:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
  border-radius: 999px;
}

@media (prefers-reduced-motion: reduce) {
  .switch::before,
  .thumb {
    transition: none;
  }
}
```

- [ ] **Step 2: Smoke-check TypeScript**

Run: `cd frontend && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -40`  
(or project’s usual typecheck if different)

Expected: no errors from new files

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/ActivePauseSwitch.tsx frontend/src/components/ui/ActivePauseSwitch.module.css
git commit -m "$(cat <<'EOF'
feat(ui): add ActivePauseSwitch for list pause toggles

Shared accessible switch with pending/disabled states for marketing lists.
EOF
)"
```

---

### Task 5: Wire promotions list (API + page + card)

**Files:**
- Modify: `frontend/src/lib/api/promotions.ts`
- Modify: `frontend/src/components/promotions/PromotionListCard.tsx`
- Modify: `frontend/src/components/pages/PromotionsPage.tsx`
- Modify: `frontend/src/components/pages/PromotionsPage.module.css`

**Interfaces:**
- Consumes: `ActivePauseSwitch`, `updatePromotion(..., { is_active })`
- Produces: list toggle updates local `promotions` from API response

- [ ] **Step 1: Extend update payload type**

In `promotions.ts`:

```ts
export type UpdatePromotionInput = Partial<CreateManualPromotionInput> & {
  is_active?: boolean;
};

export function updatePromotion(
  token: string,
  restaurantId: string,
  promotionId: string,
  data: UpdatePromotionInput,
) {
  // unchanged body
}
```

- [ ] **Step 2: Extend `PromotionListCard` props**

```ts
type PromotionListCardProps = {
  // existing props...
  toggling?: boolean;
  toggleError?: string | null;
  onToggleActive: (next: boolean) => void;
};
```

In actions group, before edit:

```tsx
<ActivePauseSwitch
  checked={promotion.is_active}
  pending={toggling}
  ariaLabel={
    promotion.is_active
      ? `Pausar promoción ${displayName}`
      : `Reactivar promoción ${displayName}`
  }
  onChange={onToggleActive}
/>
```

On `<article>`: add paused class when `!promotion.is_active`. After actions (or under card), if `toggleError`:

```tsx
{toggleError ? (
  <p className={styles.toggleError} role="alert">
    {toggleError}
  </p>
) : null}
```

Main button area: class when paused e.g. `styles.couponCardPaused` with `opacity: 0.85`.

Ensure action row `gap` ≥ `0.5rem` (8px).

- [ ] **Step 3: Page handler + table cell**

In `PromotionsPage.tsx`:

```ts
const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
const [toggleErrors, setToggleErrors] = useState<Record<string, string>>({});

async function handleToggleActive(promotion: Promotion, next: boolean) {
  if (!accessToken || !selectedRestaurantId) return;
  setTogglingIds((prev) => new Set(prev).add(promotion.id));
  setToggleErrors((prev) => {
    const { [promotion.id]: _, ...rest } = prev;
    return rest;
  });
  try {
    const updated = await updatePromotion(accessToken, selectedRestaurantId, promotion.id, {
      is_active: next,
    });
    setPromotions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  } catch {
    setToggleErrors((prev) => ({
      ...prev,
      [promotion.id]: next
        ? 'No se pudo reactivar. Intenta de nuevo.'
        : 'No se pudo pausar. Intenta de nuevo.',
    }));
  } finally {
    setTogglingIds((prev) => {
      const nextSet = new Set(prev);
      nextSet.delete(promotion.id);
      return nextSet;
    });
  }
}
```

Import `updatePromotion` if not already.

Pass props into `PromotionListCard`. In desktop table `actionsInner`, add the same `ActivePauseSwitch` with `stopPropagation` already inside the component; prevent row click via the button’s `stopPropagation`.

- [ ] **Step 4: CSS**

Add `.couponCardPaused`, `.toggleError` (small danger text), ensure `.couponCardActions` / `.actionsInner` gap ≥ 8px.

- [ ] **Step 5: Manual / typecheck**

Run: `cd frontend && node --import tsx --test src/lib/promotions/display.test.ts`

Spot-check: pause a promo in UI when API is up — switch pending then OFF + pill Pausada; soft-delete still removes from list.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api/promotions.ts frontend/src/components/promotions/PromotionListCard.tsx frontend/src/components/pages/PromotionsPage.tsx frontend/src/components/pages/PromotionsPage.module.css
git commit -m "$(cat <<'EOF'
feat(promotions): add list pause switch wired to is_active

Controlled toggle with pending/error feedback on cards and table.
EOF
)"
```

---

### Task 6: Wire coupons list

**Files:**
- Modify: `frontend/src/components/coupons/CouponListCard.tsx`
- Modify: `frontend/src/components/pages/CouponsPage.tsx`
- Modify: `frontend/src/components/pages/CouponsPage.module.css`

**Interfaces:**
- Consumes: `ActivePauseSwitch`, existing `updateCoupon(..., { is_active })`
- Produces: same pending/error pattern as promotions

- [ ] **Step 1: Extend `CouponListCard`**

Same props pattern: `toggling`, `toggleError`, `onToggleActive`. Place switch first in actions. Paused opacity + alert.

- [ ] **Step 2: Page handler**

Mirror `handleToggleActive` using `updateCoupon` and `setCoupons`. Wire table actions + cards.

- [ ] **Step 3: CSS**

Same `.couponCardPaused`, `.toggleError`, action gap as promotions page module (duplicate tokens — pages already share visual language).

- [ ] **Step 4: Verify**

Run: `cd frontend && node --import tsx --test src/lib/coupons/display.test.ts`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/coupons/CouponListCard.tsx frontend/src/components/pages/CouponsPage.tsx frontend/src/components/pages/CouponsPage.module.css
git commit -m "$(cat <<'EOF'
feat(coupons): add list pause switch for is_active

Match promotions list UX for reversible coupon pause.
EOF
)"
```

---

### Task 7: End-to-end verification

**Files:** none new

- [ ] **Step 1: Backend suite for promotions**

Run: `cd backend && python -m pytest tests/modules/test_promotions_repo.py tests/modules/test_promotions_tools.py tests/modules/test_promotion_effective.py -v`

Expected: PASS

- [ ] **Step 2: Frontend unit tests**

Run: `cd frontend && node --import tsx --test src/lib/promotions/display.test.ts src/lib/coupons/display.test.ts`

Expected: PASS

- [ ] **Step 3: Manual checklist**

- [ ] `/promociones` mobile card: pause → pending → Pausada; reactivate → vigente/estado previo
- [ ] `/promociones` desktop table: same; row click does not fire when toggling
- [ ] `/cupones`: same
- [ ] Failed network (devtools offline): alert inline; switch rolls back
- [ ] Eliminar still confirms and removes from list
- [ ] Live menu does not apply paused promo/coupon

- [ ] **Step 4: Commit only if verification fixed stragglers**; otherwise done

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Pause ≠ soft-delete for promos | 1 |
| Admin list shows paused | 1 |
| PATCH `is_active` | 1, 5 |
| Public/pricing ignore paused | 1 (`list_active` + existing `effective`) |
| `disable_promotion` pauses | 2 |
| Coupons API unchanged; list UI | 6 |
| Switch list-only, controlled pending | 4–6 |
| No toast/modal; inline error | 5–6 |
| Pill **Pausada** | 3 |
| Catalog promos pausable | 5 (same `is_active` path) |
| Touch ≥44px / stopPropagation | 4 |

No placeholders left. Types: `UpdatePromotionInput.is_active`, `ActivePauseSwitchProps`, `PromotionUpdate.is_active` consistent across tasks.

# Order History Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign restaurant panel `/history` to match `/clientes` (mobile-first list, filters, drawer, backend pagination with `total`).

**Architecture:** Extend existing `GET /restaurants/{id}/orders?board=history` with search/filter/sort + `total` COUNT; keep kitchen board unchanged. Replace `OrderHistoryView` kitchen board UI with a `CustomersPage`-style `OrderHistoryPage` + detail drawer.

**Tech Stack:** FastAPI, SQLAlchemy, Next.js (frontend panel), CSS modules, MUI icons, existing `ToolbarSelect` / `ListPagination`.

**Spec:** `docs/superpowers/specs/2026-09-03-order-history-redesign-design.es.md`

## Global Constraints

- Work on the current branch only; do not create a new branch
- Do not commit unless the user explicitly asks
- Mirror `/clientes` UX patterns and panel CSS tokens; do not invent a new palette
- Kitchen / KDS board must keep working (ignore history-only query params on kitchen)
- History filters and pagination must be server-side
- Page size for history FE: 20
- Sort only: `created_at` | `total_cents` with `asc` | `desc`
- Fourth header metric: delivery count (`type=delivery` in history)
- Date bounds: ISO `YYYY-MM-DD` interpreted as UTC day start/end inclusive

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/core/pagination.py` | Optional `total` on `CursorPage`; compound keyset helpers for `(sort_value, id)` |
| `backend/app/modules/orders/schemas.py` | `delivery` on `OrderStatusSummaryDTO` |
| `backend/app/modules/orders/repository.py` | Protocol signature for list filters |
| `backend/app/modules/orders/adapters.py` | History filters, COUNT total, compound cursor, delivery summary |
| `backend/app/modules/orders/service.py` | Validate history filter params; pass through |
| `backend/app/modules/orders/api.py` | Query params for history list |
| `backend/tests/api/test_order_history_list.py` | API tests for filters/total/summary |
| `frontend/src/lib/api/types.ts` | `CursorPage.total`; summary `delivery` |
| `frontend/src/lib/api/orders.ts` | History list query type + params |
| `frontend/src/lib/orders/historyFilters.ts` | Filter labels, date presets, active-filters helper |
| `frontend/src/components/orders/OrderHistoryDetailDrawer.tsx` | Read-only detail body |
| `frontend/src/components/pages/OrderHistoryPage.tsx` | Page shell (list + drawer) |
| `frontend/src/components/pages/OrderHistoryPage.module.css` | Styles mirrored from Customers |
| `frontend/src/app/(panel)/history/page.tsx` | Route → new page |
| `frontend/src/components/orders/OrderHistoryView.tsx` | Remove after route no longer imports it |
| `frontend/src/components/pages/OrderHistoryPage.tsx` (old thin wrapper) | Replaced entirely |

---

### Task 1: CursorPage.total + compound keyset helpers

**Files:**
- Modify: `backend/app/core/pagination.py`
- Create: `backend/tests/test_pagination_keyset.py`

**Interfaces:**
- Produces: `CursorPage.total: int | None = None`; `encode_sort_keyset_cursor(sort: str, value: str, id: uuid.UUID) -> str`; `decode_sort_keyset_cursor(cursor: str) -> tuple[str, str, uuid.UUID]`
- Keep existing `encode_keyset_cursor` / `decode_keyset_cursor` for kitchen callers until Task 2 migrates history to the new helpers (kitchen may keep using datetime helpers)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_pagination_keyset.py
import uuid
from datetime import datetime, timezone

from app.core.pagination import (
    CursorPage,
    decode_sort_keyset_cursor,
    encode_sort_keyset_cursor,
)


def test_cursor_page_total_optional():
    page = CursorPage(items=[], next_cursor=None, has_more=False)
    assert page.total is None


def test_sort_keyset_roundtrip_created_at():
    order_id = uuid.uuid4()
    created = datetime(2026, 9, 3, 12, 0, tzinfo=timezone.utc)
    cursor = encode_sort_keyset_cursor("created_at", created.isoformat(), order_id)
    sort, value, decoded_id = decode_sort_keyset_cursor(cursor)
    assert sort == "created_at"
    assert value == created.isoformat()
    assert decoded_id == order_id


def test_sort_keyset_roundtrip_total_cents():
    order_id = uuid.uuid4()
    cursor = encode_sort_keyset_cursor("total_cents", "5000", order_id)
    sort, value, decoded_id = decode_sort_keyset_cursor(cursor)
    assert sort == "total_cents"
    assert value == "5000"
    assert decoded_id == order_id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_pagination_keyset.py -v`  
Expected: FAIL (import / attribute errors for new helpers / `total`)

- [ ] **Step 3: Implement**

In `backend/app/core/pagination.py`:

```python
class CursorPage(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
    has_more: bool = False
    total: int | None = None


def encode_sort_keyset_cursor(sort: str, value: str, id: uuid.UUID) -> str:
    raw = f"{sort}|{value}|{id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_sort_keyset_cursor(cursor: str) -> tuple[str, str, uuid.UUID]:
    raw = base64.urlsafe_b64decode(cursor.encode()).decode()
    sort, value, id_str = raw.split("|", 2)
    return sort, value, uuid.UUID(id_str)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_pagination_keyset.py -v`  
Expected: PASS

- [ ] **Step 5: Commit** — skip (user asked not to commit)

---

### Task 2: History list filters, total, summary.delivery (backend)

**Files:**
- Modify: `backend/app/modules/orders/schemas.py` (`OrderStatusSummaryDTO`)
- Modify: `backend/app/modules/orders/repository.py` (protocol)
- Modify: `backend/app/modules/orders/adapters.py`
- Modify: `backend/app/modules/orders/service.py`
- Modify: `backend/app/modules/orders/api.py`
- Create: `backend/tests/api/test_order_history_list.py`

**Interfaces:**
- Consumes: Task 1 helpers; existing `ARCHIVE_ORDER_STATUSES`
- Produces list API query (history only meaningful):  
  `q: str | None`, `type: str | None`, `payment_method: str | None`, `from_date: date | None` (query name `from`), `to_date: date | None` (query name `to`), `sort: str = "created_at"`, `order: str = "desc"`  
- Produces: `CursorPage[OrderDTO]` with `total` set when `board == "history"`; kitchen leaves `total=None`  
- Produces: `OrderStatusSummaryDTO.delivery: int`

- [ ] **Step 1: Write the failing API tests**

```python
# backend/tests/api/test_order_history_list.py
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import sessionmaker

from app.db.models.orders import Order
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.orders.schemas import OrderCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.api.conftest import OWNER
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}


def _seed(engine, subdomain: str):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="History list", subdomain=subdomain),
            owner_id=OWNER,
        )
        rid = restaurant.id
        a = uow.orders.add(
            OrderCreate(
                restaurant_id=rid,
                type="delivery",
                customer_name="María López",
                customer_phone="5511111111",
                payment_method="cash",
                subtotal_cents=8000,
                total_cents=8000,
                status="delivered",
                items=[],
            )
        )
        b = uow.orders.add(
            OrderCreate(
                restaurant_id=rid,
                type="takeout",
                customer_name="Luis Pérez",
                customer_phone="5522222222",
                payment_method="transfer",
                subtotal_cents=3000,
                total_cents=3000,
                status="cancelled",
                items=[],
            )
        )
        c = uow.orders.add(
            OrderCreate(
                restaurant_id=rid,
                type="takeout",
                customer_name="Ana",
                customer_phone="5533333333",
                payment_method="card_terminal",
                subtotal_cents=5000,
                total_cents=5000,
                status="pending",
                items=[],
            )
        )
        uow.commit()
    return rid, a.id, b.id, c.id


@requires_db
def test_history_list_returns_total_and_excludes_active(client, engine):
    rid, delivered_id, cancelled_id, pending_id = _seed(engine, "hist-total-1")
    resp = client.get(
        f"/api/v1/restaurants/{rid}/orders",
        params={"board": "history", "limit": 20},
        headers=AUTH,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    ids = {item["id"] for item in body["items"]}
    assert str(delivered_id) in ids
    assert str(cancelled_id) in ids
    assert str(pending_id) not in ids


@requires_db
def test_history_filters_q_type_payment_status(client, engine):
    rid, delivered_id, _cancelled_id, _pending_id = _seed(engine, "hist-filters-1")
    resp = client.get(
        f"/api/v1/restaurants/{rid}/orders",
        params={
            "board": "history",
            "q": "maría",
            "type": "delivery",
            "payment_method": "cash",
            "status": "delivered",
        },
        headers=AUTH,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(delivered_id)


@requires_db
def test_history_summary_includes_delivery_count(client, engine):
    rid, *_ = _seed(engine, "hist-summary-1")
    resp = client.get(
        f"/api/v1/restaurants/{rid}/orders/summary",
        params={"board": "history"},
        headers=AUTH,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    assert body["delivered"] == 1
    assert body["cancelled"] == 1
    assert body["delivery"] == 1


@requires_db
def test_history_date_range_and_sort_total(client, engine):
    rid, delivered_id, cancelled_id, _pending_id = _seed(engine, "hist-sort-1")
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        order = session.get(Order, delivered_id)
        order.created_at = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
        session.commit()

    resp = client.get(
        f"/api/v1/restaurants/{rid}/orders",
        params={
            "board": "history",
            "from": "2026-09-01",
            "to": "2026-09-30",
            "sort": "total_cents",
            "order": "asc",
        },
        headers=AUTH,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(cancelled_id)
    assert body["items"][0]["total_cents"] == 3000
```

Adjust seed dates if `created_at` defaults break the date-range assertion (force `cancelled` into September in the same session block if needed).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/api/test_order_history_list.py -v`  
Expected: FAIL (unknown query params / missing `total` / missing `delivery`)

- [ ] **Step 3: Implement schema + API + service + repo**

1. Add `delivery: int = 0` to `OrderStatusSummaryDTO`.

2. In `api.py` `list_orders`, add query params (use `Query(alias=...)` or rename carefully — FastAPI: `from_: date | None = Query(default=None, alias="from")`).

3. In `service.list_for_restaurant`, when `board != "history"`, ignore extra filters. When `board == "history"`:
   - validate `type` in `{takeout, delivery}` if set
   - validate `payment_method` in `{cash, transfer, card_terminal}` if set
   - validate `sort` in `{created_at, total_cents}`, `order` in `{asc, desc}`
   - validate `status` remains archive-only (existing)

4. In `adapters.list_by_restaurant`:
   - Build shared filter WHERE for history (status archive + optional status/type/payment/q/from/to)
   - `q`: case-insensitive match on `customer_name`, digit-stripped phone contains, or `note` ILIKE
   - `from`/`to`: `created_at >= from 00:00:00 UTC` and `created_at < to+1day 00:00:00 UTC`
   - COUNT(*) with same filters → `total` when `board == "history"` else `total=None`
   - ORDER BY sort column + `id`, direction from `order`
   - Cursor via `encode_sort_keyset_cursor` / `decode_sort_keyset_cursor`; apply keyset inequality matching sort direction

5. In `status_summary` for history board, also count delivery:

```python
delivery = int(
    self._session.scalar(
        select(func.count()).where(
            Order.restaurant_id == restaurant_id,
            Order.status.in_(ARCHIVE_ORDER_STATUSES),
            Order.type == "delivery",
        )
    )
    or 0
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/api/test_order_history_list.py tests/api/test_order_kitchen_board.py -v`  
Expected: all PASS (kitchen regression included)

- [ ] **Step 5: Commit** — skip

---

### Task 3: Frontend API client + history filter helpers

**Files:**
- Modify: `frontend/src/lib/api/types.ts`
- Modify: `frontend/src/lib/api/orders.ts`
- Create: `frontend/src/lib/orders/historyFilters.ts`
- Create: `frontend/src/lib/orders/historyFilters.test.ts`

**Interfaces:**
- Produces:
  - `CursorPage<T>.total?: number | null`
  - `OrderStatusSummary.delivery: number`
  - `HistoryOrdersListQuery` with `board: 'history'`, optional `status`, `q`, `type`, `payment_method`, `from`, `to`, `sort`, `order`
  - `listRestaurantOrders(..., query?: KitchenOrdersListQuery | HistoryOrdersListQuery)`
  - `historyDateRange(preset, now?): { from?: string; to?: string }`
  - `historyFiltersActive(filters): boolean`

- [ ] **Step 1: Write failing helper tests**

```typescript
// frontend/src/lib/orders/historyFilters.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HISTORY_STATUS_LABELS,
  historyDateRange,
  historyFiltersActive,
} from './historyFilters';

test('historyDateRange today is single UTC day', () => {
  const now = new Date('2026-09-03T15:00:00Z');
  assert.deepEqual(historyDateRange('today', now), {
    from: '2026-09-03',
    to: '2026-09-03',
  });
});

test('historyDateRange 7d inclusive window', () => {
  const now = new Date('2026-09-03T15:00:00Z');
  assert.deepEqual(historyDateRange('7d', now), {
    from: '2026-08-28',
    to: '2026-09-03',
  });
});

test('historyFiltersActive detects non-default filters', () => {
  assert.equal(
    historyFiltersActive({
      query: '',
      status: 'all',
      type: 'all',
      payment: 'all',
      recency: 'all',
    }),
    false,
  );
  assert.equal(
    historyFiltersActive({
      query: 'ana',
      status: 'all',
      type: 'all',
      payment: 'all',
      recency: 'all',
    }),
    true,
  );
  assert.ok(HISTORY_STATUS_LABELS.delivered);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm exec tsx --test src/lib/orders/historyFilters.test.ts`  
(or the repo’s usual node:test runner for `*.test.ts`)  
Expected: FAIL module not found

- [ ] **Step 3: Implement helpers + API types**

`historyFilters.ts` exports:

```typescript
export type HistoryStatusFilter = 'all' | 'delivered' | 'cancelled';
export type HistoryTypeFilter = 'all' | 'delivery' | 'takeout';
export type HistoryPaymentFilter = 'all' | 'cash' | 'transfer' | 'card_terminal';
export type HistoryRecencyFilter = 'all' | 'today' | '7d' | '30d' | 'custom';
export type HistorySort = 'created_at' | 'total_cents';
export type HistorySortOrder = 'asc' | 'desc';

export const HISTORY_STATUS_LABELS: Record<HistoryStatusFilter, string> = {
  all: 'Todos',
  delivered: 'Entregados',
  cancelled: 'Cancelados',
};

export const HISTORY_TYPE_LABELS: Record<HistoryTypeFilter, string> = {
  all: 'Todos',
  delivery: 'Entrega',
  takeout: 'Para llevar',
};

export const HISTORY_PAYMENT_LABELS: Record<HistoryPaymentFilter, string> = {
  all: 'Todos',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card_terminal: 'Terminal',
};

export const HISTORY_RECENCY_LABELS: Record<Exclude<HistoryRecencyFilter, 'custom'>, string> = {
  all: 'Todo',
  today: 'Hoy',
  '7d': '7 días',
  '30d': '30 días',
};

export function historyDateRange(
  preset: Exclude<HistoryRecencyFilter, 'custom' | 'all'>,
  now = new Date(),
): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  if (preset === 'today') return { from: to, to };
  const days = preset === '7d' ? 6 : 29; // inclusive window ending today
  const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  fromDate.setUTCDate(fromDate.getUTCDate() - days);
  return { from: fromDate.toISOString().slice(0, 10), to };
}

export function historyFiltersActive(filters: {
  query: string;
  status: HistoryStatusFilter;
  type: HistoryTypeFilter;
  payment: HistoryPaymentFilter;
  recency: HistoryRecencyFilter;
  customFrom?: string;
  customTo?: string;
}): boolean {
  if (filters.query.trim()) return true;
  if (filters.status !== 'all') return true;
  if (filters.type !== 'all') return true;
  if (filters.payment !== 'all') return true;
  if (filters.recency !== 'all') return true;
  return false;
}
```

Update `CursorPage` and `OrderStatusSummary` in `types.ts`. Extend `listRestaurantOrders` to append the new query params when present.

- [ ] **Step 4: Run tests**

Run: same as Step 2  
Expected: PASS

- [ ] **Step 5: Commit** — skip

---

### Task 4: OrderHistoryDetailDrawer

**Files:**
- Create: `frontend/src/components/orders/OrderHistoryDetailDrawer.tsx`
- Optional CSS module colocated or reuse page module section classes

**Interfaces:**
- Consumes: `Order` from `@/lib/api/types`
- Produces: `<OrderHistoryDetailDrawer order={Order} />` read-only sections

- [ ] **Step 1: Implement drawer body** (no separate unit test; verified via page)

Structure (mirror CustomerDetailDrawer density, not kitchen ticket):

```tsx
'use client';

import type { Order } from '@/lib/api/types';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import {
  countOrderItems,
  formatCents,
  formatOrderDateTime,
  formatOrderDisplayId,
  formatOrderPaymentLabel,
  formatOrderTypeLabel,
} from '@/lib/orders/orderDisplay';
import { customerWhatsAppHref } from '@/lib/customers/display'; // or local equivalent if order-only
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

export function OrderHistoryDetailDrawer({ order }: { order: Order }) {
  return (
    <div>
      <p>#{formatOrderDisplayId(order)}</p>
      {/* sections: cliente, fulfillment, items, total, cancellation_reason */}
    </div>
  );
}
```

Use semantic sections with labels; include WhatsApp link when phone parses; show cancellation reason only if present.

If `customerWhatsAppHref` is customer-specific, duplicate the small href builder already used elsewhere for orders (grep `wa.me` in orders components) instead of forcing a bad import.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -40`  
Expected: no errors from the new file

- [ ] **Step 3: Commit** — skip

---

### Task 5: OrderHistoryPage UI (Clientes mirror)

**Files:**
- Create: `frontend/src/components/pages/OrderHistoryPage.module.css` (start from copy of `CustomersPage.module.css`, rename class semantics: `orderCard`, etc.)
- Replace: `frontend/src/components/pages/OrderHistoryPage.tsx`
- Modify: `frontend/src/app/(panel)/history/page.tsx` if needed (should already import `OrderHistoryPage`)

**Interfaces:**
- Consumes: Task 2/3 API; Task 4 drawer; `useAuth`; `useRestaurantAccess` or `useRestaurantOrders` for `restaurantId` — prefer **`useRestaurantAccess().selectedRestaurantId`** like Customers for consistency
- Produces: full `/history` page

- [ ] **Step 1: Build page state + data loading** (pattern from `CustomersPage`)

State: `orders`, `summary`, `total`, `loading`, `hasLoaded`, `error`, `query`/`debouncedQuery`, filters, `sort`/`order`, cursor stack, `selectedOrder`.

Load:

```typescript
const page = await listRestaurantOrders(accessToken, restaurantId, 20, listCursor, {
  board: 'history',
  status: status === 'all' ? undefined : status,
  q: debouncedQuery.trim() || undefined,
  type: type === 'all' ? undefined : type,
  payment_method: payment === 'all' ? undefined : payment,
  from: dateFrom,
  to: dateTo,
  sort,
  order,
});
const summary = await getRestaurantOrderSummary(accessToken, restaurantId, 'history');
```

Only refresh summary when restaurant changes / first load (not on every filter), matching Customers’ global stats behavior.

- [ ] **Step 2: Render layout**

- Header + 4 metrics (`summary.total`, `delivered`, `cancelled`, `delivery`)
- Search + ToolbarSelect filters (status, type, payment, recency; mobile sort select)
- For `recency === 'custom'`: two date inputs (`type="date"`) setting `customFrom`/`customTo`
- Desktop table + mobile cards
- ListPagination
- Drawer shell (copy Customers `Drawer` helper locally or extract — **prefer local copy in page** to avoid drive-by refactor)
- Soft loading opacity; empty / error states per spec

Card content: `#id`, customer name, status badge text, total, elapsed, chevron.

- [ ] **Step 3: Manual verify**

With `pnpm run dev` + backend: open `/history` at 375px and desktop; filter, paginate, open drawer.

- [ ] **Step 4: Commit** — skip

---

### Task 6: Remove kitchen-history UI path

**Files:**
- Delete or stop importing: `frontend/src/components/orders/OrderHistoryView.tsx`
- Remove unused import of `OrdersPage.module.css` / kitchen styles from history route
- Grep for `OrderHistoryView` and remove dead references

- [ ] **Step 1: Grep**

Run: `rg OrderHistoryView frontend`  
Expected: only the file itself (or zero after delete)

- [ ] **Step 2: Delete `OrderHistoryView.tsx` if unused**

- [ ] **Step 3: Ensure history route renders new page only**

`frontend/src/app/(panel)/history/page.tsx`:

```tsx
import OrderHistoryPage from '@/components/pages/OrderHistoryPage';

export default function HistoryRoute() {
  return <OrderHistoryPage />;
}
```

- [ ] **Step 4: Commit** — skip

---

### Task 7: Verification pass

- [ ] **Step 1: Backend tests**

Run: `cd backend && python -m pytest tests/api/test_order_history_list.py tests/api/test_order_kitchen_board.py tests/test_pagination_keyset.py -v`  
Expected: PASS

- [ ] **Step 2: Frontend helper tests**

Run: `cd frontend && pnpm exec tsx --test src/lib/orders/historyFilters.test.ts`  
Expected: PASS

- [ ] **Step 3: Spec checklist**

Confirm against `docs/superpowers/specs/2026-09-03-order-history-redesign-design.es.md`:

- [ ] Drawer detail
- [ ] Backend pagination + total
- [ ] Filters: status, q, type, payment, dates
- [ ] Metrics including delivery
- [ ] Mobile cards / desktop table
- [ ] Kitchen untouched
- [ ] No commit / no new branch

- [ ] **Step 4: Commit** — skip until user asks

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Drawer like Clientes | 4, 5 |
| ListPagination + backend total | 1, 2, 5 |
| Filters status/q/type/payment/dates | 2, 3, 5 |
| Sort created_at / total_cents | 2, 5 |
| Metrics + delivery | 2, 5 |
| Mobile cards / desktop table | 5 |
| Ignore history params on kitchen | 2 |
| Remove kitchen history UI | 6 |
| No new branch / no commits | Global + every Step 5 |

## Placeholder scan

No TBD steps; cursor strategy fixed to compound sort keyset; display-id sort excluded per spec.

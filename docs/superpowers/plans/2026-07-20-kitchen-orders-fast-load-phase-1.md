# Kitchen Orders Fast Load Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar pedidos en `/orders` tras un solo request inicial, sin bloquear por catálogo completo, con backend sin N+1.

**Architecture:** Primera página de pedidos en contexto; lazy product fetch al seleccionar pedido; `selectinload` en repo; un solo bootstrap de restaurante vía `RestaurantAccessProvider`.

**Tech Stack:** FastAPI/SQLAlchemy backend, Next.js 16 React frontend, Supabase auth

## Global Constraints

- UI copy in Spanish; system prompts/code in English
- No commits unless user asks
- WebSocket kitchen realtime must keep working
- Use existing `getProduct` API for lazy enrichment

---

### Task 1: Backend eager-load order items

**Files:**
- Modify: `backend/app/modules/orders/adapters.py`
- Test: `backend/tests/modules/test_orders_repo.py`

**Interfaces:**
- Produces: `list_by_restaurant` returns `OrderDTO` with populated `items` in ≤3 SQL queries per page

- [ ] **Step 1: Add selectinload to list and get**
- [ ] **Step 2: Add bounded query count test**
- [ ] **Step 3: Run pytest** `pytest backend/tests/modules/test_orders_repo.py -v`

---

### Task 2: Deduplicate restaurant bootstrap

**Files:**
- Modify: `frontend/src/app/(panel)/layout.tsx`
- Modify: `frontend/src/layouts/MainLayout.tsx`
- Modify: `frontend/src/components/onboarding/RestaurantGate.tsx`

- [ ] **Step 1: Move RestaurantAccessProvider to panel layout**
- [ ] **Step 2: RestaurantGate uses useRestaurantAccess for onboarding redirect**
- [ ] **Step 3: Remove duplicate provider from MainLayout**

---

### Task 3: First-page orders load

**Files:**
- Modify: `frontend/src/contexts/RestaurantOrdersContext.tsx`

- [ ] **Step 1: Replace fetchAllPages with single listRestaurantOrders(limit=50)**
- [ ] **Step 2: Remove redundant getRestaurant call**
- [ ] **Step 3: Expose ordersHasMore + loadMoreOrders for future use**

---

### Task 4: Non-blocking kitchen view + lazy products

**Files:**
- Create: `frontend/src/lib/orders/useKitchenOrderProducts.ts`
- Modify: `frontend/src/components/orders/KitchenOrdersView.tsx`

- [ ] **Step 1: Create hook to fetch missing products for selected order**
- [ ] **Step 2: Remove fetchAllPages products/promotions on mount**
- [ ] **Step 3: Change loading gate to orders loading only**

---

### Task 4: Verification

- [ ] **Run backend tests:** `pytest backend/tests/modules/test_orders_repo.py -v`
- [ ] **Run frontend lint:** `cd frontend && npm run lint`

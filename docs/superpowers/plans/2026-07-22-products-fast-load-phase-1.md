# Products Fast Load Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/products` show the first table page quickly by using lean API payloads, server-side pagination, shared restaurant context, and decoupled loading gates.

**Architecture:** Backend adds `view=summary` (no option groups) and a product count endpoint. Frontend loads one summary page (100 items) for the default table, fetches full product detail on edit, and loads all summary rows only when client filters are active. Restaurant ID comes from `RestaurantAccessProvider`.

**Tech Stack:** FastAPI, SQLAlchemy, Next.js, React, existing cursor pagination

## Global Constraints

- Default list page size: 100 (backend max)
- Do not break existing full `ProductDTO` responses (`view=full` default)
- Match kitchen orders pattern: lean list + `getProduct` on detail
- Spanish UI copy unchanged unless loading states need tweaks

---

### Task 1: Backend summary list + count

**Files:**
- Modify: `backend/app/modules/menu/schemas.py`
- Modify: `backend/app/modules/menu/adapters.py`
- Modify: `backend/app/modules/menu/repository.py`
- Modify: `backend/app/modules/menu/service.py`
- Modify: `backend/app/modules/menu/api.py`
- Test: `backend/tests/modules/test_menu_repo.py`

- [ ] Add `ProductCountDTO`, `view` query param on list products
- [ ] Skip option_groups eager load when `view=summary`
- [ ] Add `count_products` repository method + API route
- [ ] Test summary list omits option groups and count works

### Task 2: Frontend API + data layer

**Files:**
- Modify: `frontend/src/lib/api/menu.ts`
- Modify: `frontend/src/lib/api/types.ts` (if needed)
- Modify: `frontend/src/services/db/supplierProducts.ts`
- Test: `frontend/src/services/db/supplierProducts.test.ts`

- [ ] `listProducts(..., { view: 'summary' })`
- [ ] `getProductCount`
- [ ] `fetchSupplierProductDetail` via `getProduct`
- [ ] `fetchAllSupplierProductsSummary` for filter mode
- [ ] Admin page size 100

### Task 3: ProductsPage integration

**Files:**
- Modify: `frontend/src/components/pages/ProductsPage.tsx`

- [ ] Use `useRestaurantAccess` instead of `resolveSupplierIdByEmail`
- [ ] `productsTabLoading` excludes `categoriesLoading`
- [ ] Server pagination default path + filter fallback
- [ ] Load full product on edit drawer open
- [ ] Lazy load copy-source catalog when drawer opens

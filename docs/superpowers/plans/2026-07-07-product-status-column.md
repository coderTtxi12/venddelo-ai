# Product `status` Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `is_active` + `is_published` + `approval_status` on products with a single `status` column (`active` | `inactive` | `draft`) across DB, backend, frontend, and assistant tools.

**Architecture:** Alembic migration backfills `status` from legacy flags, drops old columns and `SoftDeleteMixin` fields on `Product`, then updates repository filters, API schemas, public menu/order guards, assistant payloads, and frontend visibility helpers to use `status` only.

**Tech Stack:** Python 3.12, SQLAlchemy, Alembic, FastAPI, Pydantic, pytest; Next.js/TypeScript frontend.

**Spec:** `docs/superpowers/specs/2026-07-07-product-status-column-design.md`

---

### Task 1: Migration + model

**Files:**
- Create: `backend/migrations/versions/XXXX_product_status_column.py`
- Modify: `backend/app/db/models/menu.py`
- Modify: `backend/app/modules/menu/schemas.py`
- Test: `backend/tests/modules/test_product_status_migration.py`

- [ ] **Step 1: Write migration test for backfill mapping**

```python
@pytest.mark.parametrize(
    "is_published,approval_status,is_active,expected",
    [
        (True, "approved", True, "active"),
        (True, "approved", False, "inactive"),
        (False, "approved", True, "draft"),
        (True, "draft", True, "draft"),
    ],
)
def test_legacy_flags_map_to_status(is_published, approval_status, is_active, expected):
    assert legacy_product_status(is_published, approval_status, is_active) == expected
```

- [ ] **Step 2: Add migration** — add `status`, backfill, drop `is_published`, `approval_status`, `is_active`, `deleted_at` on products; add check constraint + index.

- [ ] **Step 3: Update `Product` model** — remove `SoftDeleteMixin`, add `status: Mapped[str]` with check constraint.

- [ ] **Step 4: Update Pydantic schemas** — `ProductStatus = Literal["active","inactive","draft"]` on Create/Update/DTO.

- [ ] **Step 5: Run tests** — `pytest backend/tests/modules/test_product_status_migration.py -q`

---

### Task 2: Repository + service + public menu

**Files:**
- Modify: `backend/app/modules/menu/adapters.py`
- Modify: `backend/app/modules/menu/service.py`
- Modify: `backend/app/modules/menu/api.py`
- Modify: `backend/app/modules/public/api.py`
- Modify: `backend/app/modules/orders/service.py`
- Test: `backend/tests/modules/test_menu_repo.py`, `backend/tests/api/test_public_live_menu_order.py`

- [ ] **Step 1: Replace `_load_menu_products(published_only=True)`** with `status.in_(('active','inactive'))`.

- [ ] **Step 2: Order public menu** — `status='active'` first, then `inactive`, then `created_at`.

- [ ] **Step 3: Remove `deleted_at` / `is_active` logic** from `update_product` adapter.

- [ ] **Step 4: Simplify `get_product` / `list_products`** — no `is_active` filtering for owner reads.

- [ ] **Step 5: Orders + cart quote** — guard `product.status == 'active'`.

- [ ] **Step 6: Remove `/approval` and `/publish` product endpoints** + service methods.

- [ ] **Step 7: Run tests** — `pytest backend/tests/modules/test_menu_repo.py backend/tests/api/test_public_live_menu_order.py -q`

---

### Task 3: Assistant menu_read

**Files:**
- Modify: `backend/app/modules/assistant/skills/menu_read/tools.py`
- Modify: `backend/app/modules/assistant/skills/menu_read/SKILL.md`
- Modify: `backend/app/modules/assistant/skills/product_resolve.py`
- Test: `backend/tests/modules/test_menu_read_tools.py`, `backend/tests/modules/test_menu_read_search.py`

- [ ] **Step 1: Remove `_live_menu_status()`** — use `product.status` in `_product_payload`.

- [ ] **Step 2: Update counts** — `{ total, active, inactive, draft }`.

- [ ] **Step 3: Update tool schemas/descriptions** for `list_products`, `search_products`, `get_product`.

- [ ] **Step 4: Update SKILL.md** — replace `live_menu_status` / triple-flag docs with `status`.

- [ ] **Step 5: Fix tests** — Wild Rooster wings tests, draft/inactive search tests.

- [ ] **Step 6: Run tests** — `pytest backend/tests/modules/test_menu_read_tools.py backend/tests/modules/test_menu_read_search.py -q`

---

### Task 4: Assistant menu_write + update_product

**Files:**
- Modify: `backend/app/modules/assistant/skills/menu_write/tools.py`
- Modify: `backend/app/modules/assistant/skills/menu_write/SKILL.md`
- Modify: `backend/app/modules/assistant/skills/menu_import/apply_batch.py`
- Modify: `backend/app/modules/assistant/agent/workflow/tool_catalog.py` (regenerated descriptions)
- Test: `backend/tests/modules/test_menu_write_tools.py`

- [ ] **Step 1: `update_product` input** — replace `is_active`, `is_published`, `approval_status` with `status` enum.

- [ ] **Step 2: `create_product` input** — add optional `status` (default `draft`).

- [ ] **Step 3: `_product_payload`** — return `status` only.

- [ ] **Step 4: Rewrite SKILL.md** — Spanish examples:

```markdown
| status | Significado |
| active | Visible en menú público, se puede pedir |
| inactive | Visible como "No disponible", no se puede pedir |
| draft | Solo en panel, oculto del menú público |

Ejemplo: `update_product({ "name": "Wings & Fries", "status": "active" })`
```

- [ ] **Step 5: Update menu_import** — set `status='active'` instead of `is_published=True`.

- [ ] **Step 6: Run tests** — `pytest backend/tests/modules/test_menu_write_tools.py -q`

---

### Task 5: Frontend

**Files:**
- Modify: `frontend/src/lib/api/types.ts`
- Modify: `frontend/src/lib/menu/productVisibility.ts`
- Modify: `frontend/src/services/db/supplierProducts.ts`
- Modify: `frontend/src/lib/digital-menu/orderableProducts.ts`
- Modify: `frontend/src/components/digital-menu/menuProductUi.tsx`
- Modify: `frontend/src/lib/api/menu.ts`, `frontend/src/lib/api/mappers.ts`
- Test: add `frontend/src/lib/menu/productVisibility.test.ts` if vitest exists, else manual checklist

- [ ] **Step 1: API types** — `status: 'active' | 'inactive' | 'draft'` on Product.

- [ ] **Step 2: Refactor `productVisibility.ts`** to map `status` ↔ UI states.

- [ ] **Step 3: `supplierProducts.ts`** — PATCH `{ status }` only.

- [ ] **Step 4: Public menu** — `isOrderable = status === 'active'`, listed = `status !== 'draft'`.

- [ ] **Step 5: Remove `ApprovalStatus` from product draft types** where only used for visibility.

- [ ] **Step 6: Run frontend typecheck** — `cd frontend && npm run typecheck` (or `tsc --noEmit`).

---

### Task 6: Remaining tests + seed + docs

**Files:**
- Modify: `backend/tests/**` (grep `is_published|approval_status|live_menu_status|en_menu`)
- Modify: `backend/scripts/seed.py`
- Modify: `docs/live-menu-product-reference.en.md`

- [ ] **Step 1: Grep and fix** all product flag references in tests.

- [ ] **Step 2: Update seed script** — products created with `status`.

- [ ] **Step 3: Full backend pytest** — `cd backend && pytest -q`

- [ ] **Step 4: Smoke test** — Wild Rooster `Wings & Fries` → `update_product status=active` → public menu lists it as orderable.

---

## Execution choice

Plan saved to `docs/superpowers/plans/2026-07-07-product-status-column.md`.

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
**2. Inline Execution** — implement in this session with checkpoints

Which approach?

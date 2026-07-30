# Bulk Hard-Delete Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow restaurant owners to multi-select products on the current `/products` page and permanently hard-delete them in one atomic API call.

**Architecture:** New `POST .../products/permanent-bulk` endpoint with `{ product_ids }` (max 20), service validates ownership of every ID before deleting any (all-or-nothing in the request transaction), then frontend adds checkbox column + selection action bar that calls the bulk helper and reuses `ConfirmDialog`.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, pytest (`@requires_db`), Next.js/React TypeScript, CSS modules, node:test for copy helpers.

## Global Constraints

- Hard-delete only (same semantics as `DELETE .../products/{id}/permanent`)
- Atomic: if any ID is missing / wrong restaurant → `404`, no products deleted
- Empty `product_ids` → `400`; duplicates deduped; max length 20 (`PRODUCTS_PAGE_SIZE`)
- Select-all = current page only; clear selection on page/filter/tab change
- Soft-delete and unitario `/permanent` unchanged
- No category bulk; no storage cleanup; no assistant; no delivery-dashboard
- UI uses existing dashboard CSS variables / `dangerGhostBtn`; responsive desktop/tablet/mobile
- Spec: `docs/superpowers/specs/2026-07-30-bulk-delete-products-design.es.md`
- Commits: prepare clean diffs; skip `git commit` steps if the human prefers to commit themselves

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/modules/menu/schemas.py` | `ProductPermanentBulkDelete` body |
| `backend/app/modules/menu/repository.py` | Abstract `hard_delete_products` |
| `backend/app/modules/menu/adapters.py` | SQLAlchemy bulk hard-delete |
| `backend/app/modules/menu/service.py` | `permanently_delete_products` (validate then delete) |
| `backend/app/modules/menu/api.py` | `POST .../permanent-bulk` → 204 |
| `backend/tests/modules/test_menu_bulk_hard_delete.py` | Repo/API bulk tests |
| `backend/tests/services/test_menu_service.py` | Fake stub + service tests |
| `frontend/src/lib/api/menu.ts` | `permanentlyDeleteProductsBulk` |
| `frontend/src/services/db/supplierProducts.ts` | `deleteSupplierProducts` |
| `frontend/src/lib/menu/deleteConfirmCopy.ts` | Bulk confirm copy |
| `frontend/src/lib/menu/deleteConfirmCopy.test.ts` | Copy unit tests |
| `frontend/src/components/pages/ProductsPage.tsx` | Selection state, action bar, confirm flow |
| `frontend/src/components/pages/ProductsPage.module.css` | Checkbox column, selection bar, responsive |

---

### Task 1: Schema + repo `hard_delete_products` + tests

**Files:**
- Modify: `backend/app/modules/menu/schemas.py`
- Modify: `backend/app/modules/menu/repository.py`
- Modify: `backend/app/modules/menu/adapters.py`
- Create: `backend/tests/modules/test_menu_bulk_hard_delete.py`
- Modify: `backend/tests/services/test_menu_service.py` (Fake stub so ABC stays satisfied)

**Interfaces:**
- Consumes: existing `hard_delete_product`, `Product` model, `@requires_db` fixtures
- Produces:
  - `ProductPermanentBulkDelete(product_ids: list[uuid.UUID])` with `Field(min_length=1, max_length=20)`
  - `MenuRepository.hard_delete_products(ids: list[uuid.UUID]) -> int` (count deleted; assumes caller validated existence)
  - `SqlAlchemyMenuRepository.hard_delete_products` implementation

- [ ] **Step 1: Write failing tests**

Create `backend/tests/modules/test_menu_bulk_hard_delete.py`:

```python
import uuid

from pydantic import ValidationError as PydanticValidationError

from app.db.models.menu import OptionGroup, Product
from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.menu.api import router as menu_router
from app.modules.menu.schemas import (
    CategoryCreate,
    OptionGroupCreate,
    OptionItemCreate,
    ProductCreate,
    ProductPermanentBulkDelete,
)
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def _restaurant(session, subdomain: str):
    return SqlAlchemyRestaurantRepository(session).add(
        RestaurantCreate(name="R", subdomain=subdomain)
    )


def test_product_permanent_bulk_delete_schema_rejects_empty():
    try:
        ProductPermanentBulkDelete(product_ids=[])
        raise AssertionError("expected validation error")
    except PydanticValidationError:
        pass


def test_product_permanent_bulk_delete_schema_rejects_over_max():
    ids = [uuid.uuid4() for _ in range(21)]
    try:
        ProductPermanentBulkDelete(product_ids=ids)
        raise AssertionError("expected validation error")
    except PydanticValidationError:
        pass


def test_permanent_bulk_route_returns_no_content():
    routes = {
        (route.path, frozenset(route.methods or set())): route.status_code
        for route in menu_router.routes
    }
    assert (
        routes[
            (
                "/restaurants/{restaurant_id}/products/permanent-bulk",
                frozenset({"POST"}),
            )
        ]
        == 204
    )


@requires_db
def test_hard_delete_products_removes_all(session):
    restaurant = _restaurant(session, "bulk-hd-1")
    repo = SqlAlchemyMenuRepository(session)
    category = repo.add_category(CategoryCreate(restaurant_id=restaurant.id, name="C"))
    p1 = repo.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="A",
            price_cents=100,
            category_ids=[category.id],
            status="active",
        )
    )
    p2 = repo.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="B",
            price_cents=200,
            category_ids=[category.id],
            status="active",
        )
    )
    group = repo.add_option_group(
        p1.id,
        OptionGroupCreate(
            title="Size",
            selection="single",
            items=[OptionItemCreate(label="L", price_delta_cents=0)],
        ),
    )

    assert repo.hard_delete_products([p1.id, p2.id]) == 2
    assert session.get(Product, p1.id) is None
    assert session.get(Product, p2.id) is None
    assert session.get(OptionGroup, group.id) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/modules/test_menu_bulk_hard_delete.py -v`

Expected: FAIL (import/`ProductPermanentBulkDelete` / `hard_delete_products` missing)

- [ ] **Step 3: Minimal schema + repo implementation**

In `schemas.py` (near other product schemas):

```python
from pydantic import Field

class ProductPermanentBulkDelete(BaseModel):
    product_ids: list[uuid.UUID] = Field(min_length=1, max_length=20)
```

In `repository.py` abstract:

```python
@abstractmethod
def hard_delete_products(self, ids: list[uuid.UUID]) -> int: ...
```

In `adapters.py`:

```python
def hard_delete_products(self, ids: list[uuid.UUID]) -> int:
    deleted = 0
    for product_id in ids:
        if self.hard_delete_product(product_id):
            deleted += 1
    return deleted
```

In `FakeMenuRepo` (`test_menu_service.py`):

```python
def hard_delete_products(self, ids):
    deleted = 0
    for product_id in ids:
        if self.hard_delete_product(product_id):
            deleted += 1
    return deleted
```

- [ ] **Step 4: Run tests — schema + repo pass; route test still fails**

Run: `cd backend && python -m pytest tests/modules/test_menu_bulk_hard_delete.py -v`

Expected: schema + repo PASS; `test_permanent_bulk_route_returns_no_content` FAIL until Task 2

- [ ] **Step 5: Commit (optional)**

```bash
git add backend/app/modules/menu/schemas.py \
  backend/app/modules/menu/repository.py \
  backend/app/modules/menu/adapters.py \
  backend/tests/modules/test_menu_bulk_hard_delete.py \
  backend/tests/services/test_menu_service.py
git commit -m "feat(menu): add hard_delete_products repo + bulk schema"
```

---

### Task 2: Service + API endpoint

**Files:**
- Modify: `backend/app/modules/menu/service.py`
- Modify: `backend/app/modules/menu/api.py`
- Modify: `backend/tests/services/test_menu_service.py`
- Modify: `backend/tests/modules/test_menu_bulk_hard_delete.py` (add service-oriented cases if useful; keep route assertion)

**Interfaces:**
- Consumes: `ProductPermanentBulkDelete`, `hard_delete_products`, `get_product_by_id`, `NotFoundError`
- Produces:
  - `MenuService.permanently_delete_products(restaurant_id: uuid.UUID, product_ids: list[uuid.UUID]) -> None`
  - Route `POST /restaurants/{restaurant_id}/products/permanent-bulk` → 204 + cache invalidate

- [ ] **Step 1: Write failing service tests**

Append to `backend/tests/services/test_menu_service.py`:

```python
def test_permanently_delete_products_all_or_nothing():
    repo = FakeMenuRepo()
    _seed_category(repo)
    p1 = repo.add_product(
        ProductCreate(
            restaurant_id=RID,
            name="A",
            price_cents=100,
            category_ids=[CAT_ID],
            status="active",
        )
    )
    missing = uuid.uuid4()
    service = MenuService(repo)
    try:
        service.permanently_delete_products(RID, [p1.id, missing])
        raise AssertionError("expected NotFoundError")
    except NotFoundError:
        pass
    assert repo.get_product_by_id(p1.id) is not None


def test_permanently_delete_products_deletes_all():
    repo = FakeMenuRepo()
    _seed_category(repo)
    p1 = repo.add_product(
        ProductCreate(
            restaurant_id=RID,
            name="A",
            price_cents=100,
            category_ids=[CAT_ID],
            status="active",
        )
    )
    p2 = repo.add_product(
        ProductCreate(
            restaurant_id=RID,
            name="B",
            price_cents=200,
            category_ids=[CAT_ID],
            status="active",
        )
    )
    MenuService(repo).permanently_delete_products(RID, [p1.id, p2.id, p1.id])
    assert repo.get_product_by_id(p1.id) is None
    assert repo.get_product_by_id(p2.id) is None
```

(Import `NotFoundError` if not already imported in that file.)

- [ ] **Step 2: Run service tests — expect FAIL**

Run: `cd backend && python -m pytest tests/services/test_menu_service.py::test_permanently_delete_products_all_or_nothing tests/services/test_menu_service.py::test_permanently_delete_products_deletes_all -v`

Expected: FAIL (`permanently_delete_products` missing)

- [ ] **Step 3: Implement service + API**

In `service.py` after `permanently_delete_product`:

```python
def permanently_delete_products(
    self, restaurant_id: uuid.UUID, product_ids: list[uuid.UUID]
) -> None:
    unique_ids = list(dict.fromkeys(product_ids))
    for product_id in unique_ids:
        prod = self._repo.get_product_by_id(product_id)
        if prod is None or prod.restaurant_id != restaurant_id:
            raise NotFoundError("Product not found")
    deleted = self._repo.hard_delete_products(unique_ids)
    if deleted != len(unique_ids):
        raise NotFoundError("Product not found")
```

In `api.py` imports add `ProductPermanentBulkDelete`. After `permanently_delete_product` route:

```python
@router.post(
    "/restaurants/{restaurant_id}/products/permanent-bulk",
    status_code=status.HTTP_204_NO_CONTENT,
)
def permanently_delete_products_bulk(
    data: ProductPermanentBulkDelete,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    service.permanently_delete_products(restaurant.id, data.product_ids)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
```

- [ ] **Step 4: Run all bulk-related tests**

Run:

```bash
cd backend && python -m pytest \
  tests/modules/test_menu_bulk_hard_delete.py \
  tests/services/test_menu_service.py::test_permanently_delete_products_all_or_nothing \
  tests/services/test_menu_service.py::test_permanently_delete_products_deletes_all \
  tests/modules/test_menu_hard_delete.py \
  -v
```

Expected: all PASS (existing hard-delete suite still green)

- [ ] **Step 5: Commit (optional)**

```bash
git add backend/app/modules/menu/service.py \
  backend/app/modules/menu/api.py \
  backend/tests/services/test_menu_service.py \
  backend/tests/modules/test_menu_bulk_hard_delete.py
git commit -m "feat(menu): add permanent-bulk products endpoint"
```

---

### Task 3: Frontend API client + supplier helper

**Files:**
- Modify: `frontend/src/lib/api/menu.ts`
- Modify: `frontend/src/services/db/supplierProducts.ts`
- Modify: `frontend/src/services/db/index.ts` (re-export if other deletes are exported)

**Interfaces:**
- Consumes: `apiRequest`, `permanentlyDeleteProduct` pattern
- Produces:
  - `permanentlyDeleteProductsBulk(token, restaurantId, productIds: string[]): Promise<void>`
  - `deleteSupplierProducts(accessToken, db, restaurantId, productIds: Id[]): Promise<void>`

- [ ] **Step 1: Add API helper**

In `frontend/src/lib/api/menu.ts` after `permanentlyDeleteProduct`:

```typescript
export function permanentlyDeleteProductsBulk(
  token: string,
  restaurantId: string,
  productIds: string[],
) {
  return apiRequest<void>(
    `/restaurants/${restaurantId}/products/permanent-bulk`,
    {
      method: 'POST',
      token,
      body: { product_ids: productIds },
    },
  );
}
```

- [ ] **Step 2: Add supplier helper**

In `supplierProducts.ts`: import `permanentlyDeleteProductsBulk`; add:

```typescript
export async function deleteSupplierProducts(
  accessToken: string,
  _db: LegacyDbClient,
  restaurantId: string,
  productIds: Id[],
): Promise<void> {
  await permanentlyDeleteProductsBulk(accessToken, restaurantId, productIds);
}
```

Export from `services/db/index.ts` if `deleteSupplierProduct` is exported there.

- [ ] **Step 3: Typecheck / smoke**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -40`

Expected: no new errors on these symbols (existing project errors unrelated are OK to ignore if pre-existing)

- [ ] **Step 4: Commit (optional)**

```bash
git add frontend/src/lib/api/menu.ts \
  frontend/src/services/db/supplierProducts.ts \
  frontend/src/services/db/index.ts
git commit -m "feat(frontend): add permanent-bulk products API client"
```

---

### Task 4: Bulk confirm copy

**Files:**
- Modify: `frontend/src/lib/menu/deleteConfirmCopy.ts`
- Modify: `frontend/src/lib/menu/deleteConfirmCopy.test.ts`

**Interfaces:**
- Consumes: existing `buildDeleteConfirmCopy`
- Produces: `buildDeleteConfirmCopy({ kind: 'products', count: number })`

- [ ] **Step 1: Write failing tests**

Append to `deleteConfirmCopy.test.ts`:

```typescript
test('bulk products confirm copy uses count and warns irreversible', () => {
  const copy = buildDeleteConfirmCopy({ kind: 'products', count: 3 });
  assert.equal(copy.title, '¿Eliminar 3 productos?');
  assert.match(copy.description, /no se puede deshacer/i);
  assert.equal(copy.confirmLabel, 'Eliminar');
  assert.equal(copy.cancelLabel, 'Cancelar');
});

test('bulk products confirm copy singular wording for one', () => {
  const copy = buildDeleteConfirmCopy({ kind: 'products', count: 1 });
  assert.equal(copy.title, '¿Eliminar 1 producto?');
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd frontend && node --import tsx --test src/lib/menu/deleteConfirmCopy.test.ts`

(If the project uses a different test runner command, use the same as existing deleteConfirmCopy tests in package.json / CI.)

Expected: FAIL on `kind: 'products'`

- [ ] **Step 3: Implement copy**

Update `deleteConfirmCopy.ts`:

```typescript
export type DeleteConfirmKind = 'product' | 'products' | 'category';

type DeleteConfirmArgs =
  | { kind: 'product'; name: string }
  | { kind: 'products'; count: number }
  | { kind: 'category'; name: string; linkedProductCount: number };

export function buildDeleteConfirmCopy(args: DeleteConfirmArgs): DeleteConfirmCopy {
  if (args.kind === 'products') {
    const n = args.count;
    const noun = n === 1 ? 'producto' : 'productos';
    return {
      title: `¿Eliminar ${n} ${noun}?`,
      description: 'Se quitarán del catálogo y no se puede deshacer.',
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
    };
  }

  const title = `¿Eliminar «${args.name}»?`;
  const irreversible =
    args.kind === 'product'
      ? 'Se quitará del catálogo y no se puede deshacer.'
      : 'Se eliminará del catálogo y no se puede deshacer.';
  // ... existing category branch unchanged
}
```

Keep the existing product/category branches intact (do not regress their tests).

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd frontend && node --import tsx --test src/lib/menu/deleteConfirmCopy.test.ts`

Expected: all PASS

- [ ] **Step 5: Commit (optional)**

```bash
git add frontend/src/lib/menu/deleteConfirmCopy.ts \
  frontend/src/lib/menu/deleteConfirmCopy.test.ts
git commit -m "feat(frontend): confirm copy for bulk product delete"
```

---

### Task 5: ProductsPage selection UI + bulk delete flow

**Files:**
- Modify: `frontend/src/components/pages/ProductsPage.tsx`
- Modify: `frontend/src/components/pages/ProductsPage.module.css`

**Interfaces:**
- Consumes: `deleteSupplierProducts`, `buildDeleteConfirmCopy({ kind: 'products', count })`, `paginatedProducts.items`, existing `deleteLoading` / `ConfirmDialog`
- Produces: multi-select on current page + bulk delete UX

- [ ] **Step 1: Selection state + clear rules**

Near other product state:

```typescript
const [selectedProductIds, setSelectedProductIds] = useState<Set<Id>>(() => new Set());

function clearProductSelection() {
  setSelectedProductIds(new Set());
}
```

Clear selection when:
- `productsPage` changes (`handleProductsPageChange`)
- product filters change / `clearProductTableFilters`
- `activeTab` leaves `'products'`

Extend `PendingDelete`:

```typescript
type PendingDelete =
  | { kind: 'category'; id: Id; name: string; linkedProductCount: number }
  | { kind: 'product'; id: Id; name: string }
  | { kind: 'products'; ids: Id[] };
```

Update `deleteConfirmCopy` useMemo to handle `kind === 'products'`.

- [ ] **Step 2: Checkbox column in table**

In `<thead>` before "Producto":

```tsx
<th className={`${styles.thDashboard} ${styles.selectHead}`} scope="col">
  <input
    type="checkbox"
    className={styles.selectCheckbox}
    checked={
      paginatedProducts.items.length > 0 &&
      paginatedProducts.items.every((p) => selectedProductIds.has(p.id))
    }
    ref={(el) => {
      if (!el) return;
      const pageIds = paginatedProducts.items.map((p) => p.id);
      const selectedOnPage = pageIds.filter((id) => selectedProductIds.has(id)).length;
      el.indeterminate =
        selectedOnPage > 0 && selectedOnPage < pageIds.length;
    }}
    disabled={deleteLoading || paginatedProducts.items.length === 0}
    aria-label="Seleccionar todos los productos de esta página"
    onChange={(e) => {
      const pageIds = paginatedProducts.items.map((p) => p.id);
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        if (e.target.checked) pageIds.forEach((id) => next.add(id));
        else pageIds.forEach((id) => next.delete(id));
        return next;
      });
    }}
  />
</th>
```

In each row, first `<td>` with checkbox (`stopPropagation` on click/keydown). Selected row class: `styles.rowSelected` when `selectedProductIds.has(p.id)`.

Update empty-state `colSpan` from `7` to `8`.

- [ ] **Step 3: Selection action bar**

Above the table (inside products section, when `selectedProductIds.size > 0`):

```tsx
<div className={styles.selectionBar} role="status">
  <span className={styles.selectionCount}>
    {selectedProductIds.size} seleccionados
  </span>
  <div className={styles.selectionActions}>
    <button type="button" className={styles.ghostBtn} onClick={clearProductSelection}>
      Deseleccionar
    </button>
    <button
      type="button"
      className={`${styles.dangerGhostBtn} ${styles.catalogDeleteBtn}`}
      disabled={deleteLoading || !supplierId || !accessToken}
      onClick={() => {
        setDeleteError(null);
        setPendingDelete({ kind: 'products', ids: [...selectedProductIds] });
      }}
    >
      <DeleteOutlineOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
      <span>Eliminar</span>
    </button>
  </div>
</div>
```

- [ ] **Step 4: Wire confirm + list refresh**

In `confirmPendingDelete`, branch for `target.kind === 'products'`:

```typescript
} else if (target.kind === 'products') {
  await deleteSupplierProducts(accessToken, db, supplierId, target.ids);
  const idSet = new Set(target.ids);
  if (productFiltersActive) {
    const nextCatalog = (productsFilterCatalogRef.current ?? products).filter(
      (product) => !idSet.has(product.id),
    );
    const nextDisplayedCount = displayedProducts.filter(
      (product) => !idSet.has(product.id),
    ).length;
    const lastPage = Math.max(1, Math.ceil(nextDisplayedCount / PRODUCTS_PAGE_SIZE));
    productsFilterCatalogRef.current = nextCatalog;
    setProducts(nextCatalog);
    setProductsTotalCount(nextCatalog.length);
    setProductsPage((page) => Math.min(page, lastPage));
    invalidateProductsPageCache();
  } else {
    invalidateProductsFilterCatalog();
    const nextTotal = Math.max(0, productsTotalCount - target.ids.length);
    const lastPage = Math.max(1, Math.ceil(nextTotal / PRODUCTS_PAGE_SIZE));
    const targetPage = Math.min(productsPage, lastPage);
    setProductsTotalCount(nextTotal);
    resetProductsPagination();
    void loadProductsTablePage(targetPage, { force: true });
  }
  setCopySourceProducts((prev) =>
    prev ? prev.filter((product) => !idSet.has(product.id)) : prev,
  );
  clearProductSelection();
}
```

On catch for bulk: keep `selectedProductIds`; clear `pendingDelete`; set banner  
`'No se pudieron eliminar los productos. No se eliminó ninguno. Intenta de nuevo.'`

Import `deleteSupplierProducts` from `@/services/db`.

- [ ] **Step 5: CSS (theme + responsive)**

Add to `ProductsPage.module.css` (use existing tokens only):

```css
.selectHead {
  width: 2.75rem;
  text-align: center;
}

.selectCheckbox {
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.rowSelected {
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
}

.selectionBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
}

.selectionCount {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
}

.selectionActions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

@media (max-width: 640px) {
  .selectionBar {
    position: sticky;
    bottom: 0.75rem;
    z-index: 5;
    flex-direction: column;
    align-items: stretch;
  }

  .selectionActions {
    flex-direction: column;
  }

  .selectionActions .dangerGhostBtn,
  .selectionActions .ghostBtn {
    width: 100%;
    min-height: 44px;
    justify-content: center;
  }

  .selectCheckbox {
    width: 1.35rem;
    height: 1.35rem;
  }
}
```

Ensure checkbox cell / action buttons keep `min-height`/`min-width` ≥ 44px on mobile for touch.

- [ ] **Step 6: Manual verification checklist**

1. Desktop: select 2 products → bar shows → confirm → both gone; individual Eliminar still works
2. Header checkbox selects only current page; next page starts empty
3. Change filter / page → selection clears
4. Tablet/mobile: sticky bar usable; checkboxes tappable
5. Force a bad ID (dev only) or offline → banner says none deleted; selection remains

- [ ] **Step 7: Commit (optional)**

```bash
git add frontend/src/components/pages/ProductsPage.tsx \
  frontend/src/components/pages/ProductsPage.module.css
git commit -m "feat(frontend): multi-select bulk hard-delete on /products"
```

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| `POST .../permanent-bulk` 204 | Task 2 |
| Hard-delete semantics / CASCADE / orders SET NULL | Reuses Task 1 repo → existing `hard_delete_product` |
| All-or-nothing 404 | Task 2 service validate-then-delete |
| Empty → 400, max 20, dedupe | Task 1 schema + Task 2 `dict.fromkeys` |
| Soft + unitario `/permanent` unchanged | No edits to those routes |
| Checkbox + page-only select-all | Task 5 |
| Action bar + confirm irreversible | Tasks 4–5 |
| Theme tokens + responsive sticky mobile | Task 5 CSS |
| Clear selection on page/filter/tab | Task 5 |
| Error keeps selection | Task 5 catch branch |
| No category bulk / storage / assistant | Out of plan |

No TBD/placeholder steps. Names aligned: `ProductPermanentBulkDelete`, `hard_delete_products`, `permanently_delete_products`, `permanentlyDeleteProductsBulk`, `deleteSupplierProducts`, confirm `kind: 'products'`.

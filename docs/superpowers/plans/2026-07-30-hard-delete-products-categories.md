# Hard-Delete Products & Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add permanent hard-delete API endpoints for products and categories, and point the restaurant dashboard Eliminar button at them, without changing existing soft-delete DELETE routes.

**Architecture:** New `hard_delete_*` repo methods (`session.delete`), `permanently_delete_*` service methods with ownership checks, `DELETE .../permanent` routes that invalidate menu cache. Frontend `deleteSupplier*` wrappers switch to `permanentlyDelete*` API helpers.

**Tech Stack:** FastAPI, SQLAlchemy, pytest (`@requires_db`), Next.js frontend TypeScript.

## Global Constraints

- Soft-delete `DELETE .../categories/{id}` and `DELETE .../products/{id}` behavior unchanged
- New routes only: `DELETE .../categories/{id}/permanent` and `DELETE .../products/{id}/permanent` → `204`
- Category hard-delete does **not** delete products (only unlinks via `product_categories` CASCADE)
- Orders: `order_items.product_id` SET NULL on product hard-delete; do not delete order rows
- Dashboard Eliminar uses permanent endpoints
- No storage/image cleanup; no assistant; no delivery-dashboard
- Spec: `docs/superpowers/specs/2026-07-30-hard-delete-products-categories-design.es.md`
- Commits: the human may commit themselves — still prepare clean diffs; skip `git commit` if they prefer

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/modules/menu/repository.py` | Abstract `hard_delete_category` / `hard_delete_product` |
| `backend/app/modules/menu/adapters.py` | SQLAlchemy hard delete implementations |
| `backend/app/modules/menu/service.py` | `permanently_delete_category` / `permanently_delete_product` |
| `backend/app/modules/menu/api.py` | `/permanent` routes |
| `backend/tests/modules/test_menu_hard_delete.py` | Repo/service-level hard-delete tests |
| `backend/tests/services/test_menu_service.py` | Extend Fake repo with hard_delete stubs if needed |
| `frontend/src/lib/api/menu.ts` | `permanentlyDeleteCategory` / `permanentlyDeleteProduct` |
| `frontend/src/services/db/supplierCategories.ts` | Wire `deleteSupplierCategory` → permanent |
| `frontend/src/services/db/supplierProducts.ts` | Wire `deleteSupplierProduct` → permanent |

---

### Task 1: Repo hard-delete + tests

**Files:**
- Modify: `backend/app/modules/menu/repository.py`
- Modify: `backend/app/modules/menu/adapters.py`
- Create: `backend/tests/modules/test_menu_hard_delete.py`
- Modify: `backend/tests/services/test_menu_service.py` (add Fake stubs so ABC stays satisfied)

**Interfaces:**
- Consumes: `Category`, `Product` models; existing `_restaurant` / `SqlAlchemyMenuRepository` patterns from `test_menu_repo.py`
- Produces:
  - `MenuRepository.hard_delete_category(id: uuid.UUID) -> bool`
  - `MenuRepository.hard_delete_product(id: uuid.UUID) -> bool`
  - `SqlAlchemyMenuRepository` implementations

- [ ] **Step 1: Write failing tests**

Create `backend/tests/modules/test_menu_hard_delete.py`:

```python
import uuid

from sqlalchemy import select

from app.db.models.menu import Category, Product, product_categories
from app.db.models.orders import OrderItem  # adjust import if OrderItem lives elsewhere
from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.menu.schemas import CategoryCreate, OptionGroupCreate, ProductCreate
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def _restaurant(session, subdomain: str):
    return SqlAlchemyRestaurantRepository(session).add(
        RestaurantCreate(name="R", subdomain=subdomain)
    )


@requires_db
def test_hard_delete_product_removes_row_and_option_groups(session):
    r = _restaurant(session, "hd-prod-1")
    repo = SqlAlchemyMenuRepository(session)
    cat = repo.add_category(CategoryCreate(restaurant_id=r.id, name="C"))
    prod = repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="Burger",
            price_cents=1000,
            category_ids=[cat.id],
            status="active",
        )
    )
    repo.add_option_group(
        prod.id,
        OptionGroupCreate(
            title="Size",
            required=False,
            selection="single",
            items=[{"label": "L", "price_delta_cents": 0}],
        ),
    )
    assert repo.hard_delete_product(prod.id) is True
    assert repo.get_product_by_id(prod.id) is None
    assert session.get(Product, prod.id) is None


@requires_db
def test_hard_delete_category_keeps_products(session):
    r = _restaurant(session, "hd-cat-1")
    repo = SqlAlchemyMenuRepository(session)
    cat = repo.add_category(CategoryCreate(restaurant_id=r.id, name="C"))
    prod = repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="Burger",
            price_cents=1000,
            category_ids=[cat.id],
            status="active",
        )
    )
    assert repo.hard_delete_category(cat.id) is True
    assert session.get(Category, cat.id) is None
    assert session.get(Product, prod.id) is not None
    links = session.execute(
        select(product_categories.c.product_id).where(
            product_categories.c.category_id == cat.id
        )
    ).all()
    assert links == []


@requires_db
def test_hard_delete_missing_returns_false(session):
    repo = SqlAlchemyMenuRepository(session)
    missing = uuid.uuid4()
    assert repo.hard_delete_category(missing) is False
    assert repo.hard_delete_product(missing) is False
```

**Important:** Before writing the file, open `backend/app/db/models/orders.py` and `OptionGroupCreate` schema to match exact field names / imports. If creating an order line for SET NULL is heavy, keep the three tests above in Task 1 and add the order-line SET NULL assertion in Task 2 via service/API or a fourth test once imports are confirmed. Prefer adding order SET NULL in Task 1 if `Order` / `OrderItem` fixtures already exist nearby — otherwise Task 2.

Adjust `OptionGroupCreate` construction to match existing tests in `test_menu_repo.py` (copy their pattern exactly).

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd backend && python -m pytest tests/modules/test_menu_hard_delete.py -v
```

Expected: FAIL (`hard_delete_*` missing on repository / adapter).

- [ ] **Step 3: Implement repo methods**

In `repository.py`, after `soft_delete_category`:

```python
@abstractmethod
def hard_delete_category(self, id: uuid.UUID) -> bool: ...
```

After `soft_delete_product`:

```python
@abstractmethod
def hard_delete_product(self, id: uuid.UUID) -> bool: ...
```

In `adapters.py`, after `soft_delete_category`:

```python
def hard_delete_category(self, id: uuid.UUID) -> bool:
    obj = self._session.get(Category, id)
    if obj is None:
        return False
    self._session.delete(obj)
    self._session.flush()
    return True
```

After `soft_delete_product`:

```python
def hard_delete_product(self, id: uuid.UUID) -> bool:
    obj = self._session.get(Product, id)
    if obj is None:
        return False
    self._session.delete(obj)
    self._session.flush()
    return True
```

In `backend/tests/services/test_menu_service.py` Fake repo class, add:

```python
def hard_delete_category(self, id):
    return False

def hard_delete_product(self, id):
    return False
```

(or real in-memory delete if the Fake stores objects — match existing Fake style).

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd backend && python -m pytest tests/modules/test_menu_hard_delete.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit (optional if human owns commits)**

```bash
git add backend/app/modules/menu/repository.py \
  backend/app/modules/menu/adapters.py \
  backend/tests/modules/test_menu_hard_delete.py \
  backend/tests/services/test_menu_service.py
git commit -m "$(cat <<'EOF'
feat(menu): add hard_delete_category and hard_delete_product repository methods

EOF
)"
```

---

### Task 2: Service + API `/permanent` routes

**Files:**
- Modify: `backend/app/modules/menu/service.py`
- Modify: `backend/app/modules/menu/api.py`
- Modify: `backend/tests/modules/test_menu_hard_delete.py` (add service/order assertions) and/or add API tests if the suite has menu API patterns

**Interfaces:**
- Consumes: `hard_delete_category` / `hard_delete_product` from Task 1
- Produces:
  - `MenuService.permanently_delete_category(restaurant_id, category_id) -> None`
  - `MenuService.permanently_delete_product(restaurant_id, product_id) -> None`
  - Routes returning 204

- [ ] **Step 1: Add service methods**

Use `get_category_by_id` / `get_product_by_id` so soft-deleted/draft rows can still be purged:

```python
def permanently_delete_category(
    self, restaurant_id: uuid.UUID, category_id: uuid.UUID
) -> None:
    cat = self._repo.get_category_by_id(category_id)
    if cat is None or cat.restaurant_id != restaurant_id:
        raise NotFoundError("Category not found")
    if not self._repo.hard_delete_category(category_id):
        raise NotFoundError("Category not found")

def permanently_delete_product(
    self, restaurant_id: uuid.UUID, product_id: uuid.UUID
) -> None:
    prod = self._repo.get_product_by_id(product_id)
    if prod is None or prod.restaurant_id != restaurant_id:
        raise NotFoundError("Product not found")
    if not self._repo.hard_delete_product(product_id):
        raise NotFoundError("Product not found")
```

Place them next to existing `delete_category` / `delete_product` (do not change those).

- [ ] **Step 2: Add API routes**

In `api.py`, after existing `delete_category`:

```python
@router.delete(
    "/restaurants/{restaurant_id}/categories/{category_id}/permanent",
    status_code=status.HTTP_204_NO_CONTENT,
)
def permanently_delete_category(
    category_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    service.permanently_delete_category(restaurant.id, category_id)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
```

After existing `delete_product`:

```python
@router.delete(
    "/restaurants/{restaurant_id}/products/{product_id}/permanent",
    status_code=status.HTTP_204_NO_CONTENT,
)
def permanently_delete_product(
    product_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    service.permanently_delete_product(restaurant.id, product_id)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
```

- [ ] **Step 3: Add order SET NULL test (if not in Task 1)**

Append to `test_menu_hard_delete.py` a test that creates a minimal order item referencing the product (follow an existing order factory in `tests/`), hard-deletes the product, and asserts the order item remains with `product_id is None`. If order setup is too heavy for unit scope, add a focused API test under `backend/tests/api/` copying auth/restaurant setup from an existing menu owner test.

Also assert soft-delete endpoints remain unchanged by re-running:

```bash
cd backend && python -m pytest tests/modules/test_menu_repo.py::test_category_crud_and_soft_delete -v
```

- [ ] **Step 4: Run hard-delete suite**

```bash
cd backend && python -m pytest tests/modules/test_menu_hard_delete.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit (optional)**

```bash
git add backend/app/modules/menu/service.py backend/app/modules/menu/api.py \
  backend/tests/modules/test_menu_hard_delete.py
git commit -m "$(cat <<'EOF'
feat(menu): add permanent hard-delete API for products and categories

EOF
)"
```

---

### Task 3: Frontend wires Eliminar to `/permanent`

**Files:**
- Modify: `frontend/src/lib/api/menu.ts`
- Modify: `frontend/src/services/db/supplierCategories.ts`
- Modify: `frontend/src/services/db/supplierProducts.ts`

**Interfaces:**
- Consumes: new backend routes from Task 2
- Produces:
  - `permanentlyDeleteCategory(token, restaurantId, categoryId): Promise<void>`
  - `permanentlyDeleteProduct(token, restaurantId, productId): Promise<void>`
  - `deleteSupplierCategory` / `deleteSupplierProduct` call the permanent helpers

- [ ] **Step 1: Add API helpers in `menu.ts`**

Keep existing `deleteCategory` / `deleteProduct`. Add:

```ts
export function permanentlyDeleteCategory(
  token: string,
  restaurantId: string,
  categoryId: string,
) {
  return apiRequest<void>(
    `/restaurants/${restaurantId}/categories/${categoryId}/permanent`,
    { method: 'DELETE', token },
  );
}

export function permanentlyDeleteProduct(
  token: string,
  restaurantId: string,
  productId: string,
) {
  return apiRequest<void>(
    `/restaurants/${restaurantId}/products/${productId}/permanent`,
    { method: 'DELETE', token },
  );
}
```

- [ ] **Step 2: Point supplier wrappers at permanent**

In `supplierCategories.ts`:

```ts
import {
  createCategory,
  permanentlyDeleteCategory,
  listCategories,
  updateCategory,
} from '@/lib/api/menu';

export async function deleteSupplierCategory(
  accessToken: string,
  _db: LegacyDbClient,
  restaurantId: string,
  categoryId: string,
): Promise<void> {
  await permanentlyDeleteCategory(accessToken, restaurantId, categoryId);
}
```

In `supplierProducts.ts`: replace `deleteProduct` import/usage with `permanentlyDeleteProduct`.

- [ ] **Step 3: Verify no remaining soft-delete calls from Eliminar path**

```bash
cd frontend && rg "deleteCategory|deleteProduct|permanentlyDelete" src/lib/api/menu.ts src/services/db/
```

Expected: `deleteSupplier*` → `permanentlyDelete*`; soft `deleteCategory`/`deleteProduct` may remain exported but unused by suppliers.

- [ ] **Step 4: Manual smoke**

With backend running: Eliminar producto → 204 on `/permanent` → row gone from DB; Eliminar categoría con productos → categoría gone, productos siguen; `/orders` history still shows past lines.

- [ ] **Step 5: Commit (optional)**

```bash
git add frontend/src/lib/api/menu.ts \
  frontend/src/services/db/supplierCategories.ts \
  frontend/src/services/db/supplierProducts.ts
git commit -m "$(cat <<'EOF'
feat(frontend): use permanent hard-delete for catalog Eliminar actions

EOF
)"
```

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Soft DELETE unchanged | Task 2 (leave + regression soft test) |
| `.../permanent` 204 routes | Task 2 |
| Hard delete product + CASCADE options | Task 1 |
| Hard delete category keeps products | Task 1 |
| Order line product_id SET NULL | Task 1 or 2 |
| Dashboard Eliminar → permanent | Task 3 |
| No storage / assistant / delivery | Global |

## Self-review notes

- Service must use `get_*_by_id` so soft-deleted categories and draft products can be purged.
- Fake repo in service tests must implement new ABC methods.
- Do not rename or remove soft_delete methods.

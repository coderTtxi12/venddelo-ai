# get_full_menu Eager Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans for task-by-task execution.

**Goal:** Eliminar N+1 en `get_full_menu` / `get_preview_menu` con `selectinload` y batch de `category_sort_indices`.

**Architecture:** Helpers batch en `adapters.py`; query de productos con eager load; DTO assembly sin queries en el loop.

**Tech Stack:** Python 3.12+, SQLAlchemy 2.x, pytest, Postgres

**Spec:** `docs/superpowers/specs/2026-06-23-get-full-menu-eager-loading-design.md`

---

### Task 1: Batch category sort indices

**Files:**
- Modify: `backend/app/modules/menu/adapters.py`
- Test: `backend/tests/modules/test_menu_repo.py`

- [ ] **Step 1: Add `_category_sort_indices_batch`**

```python
def _category_sort_indices_batch(
    session: Session, product_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[str, int]]:
    if not product_ids:
        return {}
    rows = session.execute(
        select(
            product_categories.c.product_id,
            product_categories.c.category_id,
            product_categories.c.sort_index,
        ).where(product_categories.c.product_id.in_(product_ids))
    ).all()
    result: dict[uuid.UUID, dict[str, int]] = {pid: {} for pid in product_ids}
    for row in rows:
        result[row.product_id][str(row.category_id)] = row.sort_index
    return result
```

- [ ] **Step 2: Add test `test_category_sort_indices_batch_matches_single`**

- [ ] **Step 3: Run tests**

Run: `cd backend && pytest tests/modules/test_menu_repo.py -v`

---

### Task 2: Refactor DTO assembly for batch path

**Files:**
- Modify: `backend/app/modules/menu/adapters.py`

- [ ] **Step 1: Extend `_product_to_dto` with optional `category_sort_indices`**

- [ ] **Step 2: Add `_products_to_dtos(session, products)` using batch map**

---

### Task 3: Eager-loaded product query

**Files:**
- Modify: `backend/app/modules/menu/adapters.py`

- [ ] **Step 1: Import `selectinload` from `sqlalchemy.orm`**

- [ ] **Step 2: Add `_load_menu_products(restaurant_id, *, published_only: bool)`**

```python
stmt = (
    select(Product)
    .where(Product.restaurant_id == restaurant_id)
    .options(
        selectinload(Product.categories),
        selectinload(Product.option_groups).selectinload(OptionGroup.items),
    )
    .order_by(Product.is_active.desc(), Product.created_at, Product.id)
)
if published_only:
    stmt = stmt.where(
        Product.is_published.is_(True),
        Product.approval_status == "approved",
    )
```

- [ ] **Step 3: Rewrite `get_full_menu` and `get_preview_menu` to use helpers**

---

### Task 4: Query count regression test

**Files:**
- Test: `backend/tests/modules/test_menu_repo.py`

- [ ] **Step 1: Add `test_get_full_menu_bounded_query_count`**

Use `sqlalchemy.event.listen(engine, "before_cursor_execute", ...)`; setup 5 products with categories + option groups; assert `query_count <= 10`.

- [ ] **Step 2: Run full menu test suite**

Run: `cd backend && pytest tests/modules/test_menu_repo.py tests/test_menu_cache.py -v`

---

### Task 5: Verification

- [ ] Run: `cd backend && pytest tests/modules/test_menu_repo.py tests/test_menu_cache.py -v`
- [ ] Expected: all PASS

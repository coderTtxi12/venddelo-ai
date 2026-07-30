# Bulk Create Products & Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `bulk_create_products` and `bulk_create_categories` to `MenuWriteSkill` so `catalog_agent` can create many products (with nested option groups/items) and categories in one call each.

**Architecture:** New helpers in `menu_write/bulk_create.py` reuse existing bulk parse/result helpers. `MenuService.create_product` allows empty `category_ids`. Each product row may nest `option_groups[].items[]` via `add_option_group`. Partial success per row; no rollback if complements fail after product create.

**Tech Stack:** Python, MenuService, MenuWriteSkill tools, pytest (`@requires_db` for skill tests).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-30-bulk-create-products-categories-design.es.md`
- Tools live in `MenuWriteSkill` only (no new skills, no HTTP API)
- Product required field: `name` only
- Missing price → `price_cents=0`; default status for bulk create → `active`
- Empty categories allowed on **create** only; `update_product` still rejects empty `category_ids` when provided
- Limit: `BULK_DEFAULT_LIMIT` (50) items per call
- Agent: create directly when owner already listed items (document in SKILL.md; no recap gate in code)
- No transactional rollback if option groups fail mid-row
- Commits: prepare clean diffs; skip `git commit` if the human prefers to commit themselves

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/modules/menu/service.py` | Allow `create_product` with `category_ids=[]` |
| `backend/tests/services/test_menu_service.py` | Flip/extend create-without-category tests |
| `backend/app/modules/assistant/skills/menu_write/bulk_create.py` | `bulk_create_categories`, `bulk_create_products` |
| `backend/app/modules/assistant/skills/menu_write/tools.py` | ToolDefinitions + execute dispatch |
| `backend/app/modules/assistant/skills/menu_write/SKILL.md` | Document bulk create behavior |
| `backend/app/modules/assistant/agent/workflow/tool_catalog.py` | Group listing + return hints |
| `backend/tests/modules/test_menu_write_tools.py` | Integration tests for both tools |

---

### Task 1: Allow create_product with zero categories

**Files:**
- Modify: `backend/app/modules/menu/service.py`
- Modify: `backend/tests/services/test_menu_service.py`

**Interfaces:**
- Consumes: `MenuService.create_product(restaurant_id, ProductCreate)`
- Produces: `create_product` succeeds when `category_ids == []`; still validates non-empty IDs against restaurant

- [ ] **Step 1: Write the failing test (replace old requirement)**

In `backend/tests/services/test_menu_service.py`, replace `test_product_requires_category` with:

```python
def test_create_product_allows_empty_categories():
    repo = FakeMenuRepo()
    svc = MenuService(repo)
    created = svc.create_product(
        RESTAURANT_ID,
        ProductCreate(
            restaurant_id=RESTAURANT_ID,
            name="P",
            price_cents=100,
            category_ids=[],
            status="active",
        ),
    )
    assert created.name == "P"
    assert created.category_ids == []


def test_create_product_rejects_unknown_category():
    repo = FakeMenuRepo()
    svc = MenuService(repo)
    with pytest.raises(NotFoundError):
        svc.create_product(
            RESTAURANT_ID,
            ProductCreate(
                restaurant_id=RESTAURANT_ID,
                name="P",
                price_cents=100,
                category_ids=[uuid.uuid4()],
            ),
        )
```

Ensure `NotFoundError` is imported from `app.core.exceptions` (same module as `ValidationError` already used). Keep `test_update_product` behavior that still requires ≥1 category when `category_ids` is sent — do not change that path.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend && python -m pytest tests/services/test_menu_service.py::test_create_product_allows_empty_categories -v
```

Expected: FAIL — either still raises `ValidationError` ("Product must belong to at least one category") or the new test name is missing until Step 1 is saved.

- [ ] **Step 3: Minimal service change**

In `backend/app/modules/menu/service.py`, change `create_product` from:

```python
def create_product(self, restaurant_id: uuid.UUID, data: ProductCreate) -> ProductDTO:
    if len(data.category_ids) < 1:
        raise ValidationError("Product must belong to at least one category")
    self._ensure_categories_in_restaurant(restaurant_id, data.category_ids)
    payload = data.model_copy(update={"restaurant_id": restaurant_id})
    return self._repo.add_product(payload)
```

to:

```python
def create_product(self, restaurant_id: uuid.UUID, data: ProductCreate) -> ProductDTO:
    if data.category_ids:
        self._ensure_categories_in_restaurant(restaurant_id, data.category_ids)
    payload = data.model_copy(update={"restaurant_id": restaurant_id})
    return self._repo.add_product(payload)
```

Leave `update_product`’s `len(data.category_ids) < 1` check unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend && python -m pytest tests/services/test_menu_service.py::test_create_product_allows_empty_categories tests/services/test_menu_service.py::test_create_product_rejects_unknown_category tests/services/test_menu_service.py -v
```

Expected: PASS for the two new tests; full file still green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/menu/service.py backend/tests/services/test_menu_service.py
git commit -m "feat(menu): allow creating products without categories"
```

---

### Task 2: `bulk_create_categories`

**Files:**
- Create: `backend/app/modules/assistant/skills/menu_write/bulk_create.py`
- Modify: `backend/app/modules/assistant/skills/menu_write/tools.py`
- Modify: `backend/tests/modules/test_menu_write_tools.py`

**Interfaces:**
- Consumes: `BULK_DEFAULT_LIMIT`, `_parse_items`, `_resolve_items_arg`, `BulkRowResult`, `bulk_tool_result` from `menu_write.bulk`; `MenuService.create_category`; `CategoryCreate`
- Produces: `bulk_create_categories(menu, ctx, args, *, invalidate) -> ToolResult`

- [ ] **Step 1: Write failing skill tests**

Append to `backend/tests/modules/test_menu_write_tools.py`:

```python
@requires_db
def test_menu_write_bulk_create_categories(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Create Cats", subdomain="menu-write-bulk-create-cats")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_create_categories",
        {
            "items": [
                {"name": "Tacos"},
                {"name": "Bebidas", "description": "Frías y calientes", "sort_index": 2},
            ]
        },
        ctx,
    )
    assert result.ok is True
    assert result.data["updated"] == 2
    assert result.data["failed"] == 0
    names = {row["label"] for row in result.data["results"]}
    assert names == {"Tacos", "Bebidas"}

    page = uow.menu.list_categories(
        restaurant.id,
        __import__("app.core.pagination", fromlist=["PaginationParams"]).PaginationParams(
            limit=50, cursor=None
        ),
    )
    # Prefer importing PaginationParams at top of file if not already imported.
    live_names = {c.name for c in page.items}
    assert "Tacos" in live_names
    assert "Bebidas" in live_names


@requires_db
def test_menu_write_bulk_create_categories_partial_and_limit(session):
    from app.core.pagination import PaginationParams
    from app.modules.assistant.skills.menu_write.bulk import BULK_DEFAULT_LIMIT

    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Create Cats 2", subdomain="menu-write-bulk-create-cats-2")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    partial = skill.execute(
        "bulk_create_categories",
        {"items": [{"name": "Ok"}, {"description": "missing name"}]},
        ctx,
    )
    assert partial.data["updated"] == 1
    assert partial.data["failed"] == 1
    assert partial.ok is True

    over = skill.execute(
        "bulk_create_categories",
        {"items": [{"name": f"C{i}"} for i in range(BULK_DEFAULT_LIMIT + 1)]},
        ctx,
    )
    assert over.ok is False
    assert "At most" in over.summary
```

Use the existing top-level `PaginationParams` import style from other tests in this file (add import if missing — check file header).

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend && python -m pytest tests/modules/test_menu_write_tools.py::test_menu_write_bulk_create_categories tests/modules/test_menu_write_tools.py::test_menu_write_bulk_create_categories_partial_and_limit -v
```

Expected: FAIL — unknown tool `bulk_create_categories` (or AttributeError / ok=False summary about unknown tool).

- [ ] **Step 3: Implement `bulk_create_categories`**

Create `backend/app/modules/assistant/skills/menu_write/bulk_create.py`:

```python
"""Bulk create categories and products for menu_write."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.pagination import PaginationParams
from app.modules.assistant.skills.base import ToolResult
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_write.bulk import (
    BULK_DEFAULT_LIMIT,
    BulkRowResult,
    _parse_items,
    _parse_uuid,
    _resolve_items_arg,
    bulk_tool_result,
)
from app.modules.assistant.skills.menu_write.option_item_bulk import (
    _parse_nested_option_items,
)
from app.modules.menu.schemas import (
    CategoryCreate,
    OptionGroupCreate,
    ProductCreate,
)
from app.modules.menu.service import MenuService


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def bulk_create_categories(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw = _resolve_items_arg(args, "items", "categories")
    items, err = _parse_items(raw, max_items=BULK_DEFAULT_LIMIT, entity_label="category")
    if err:
        return ToolResult(ok=False, summary=err)

    results: list[BulkRowResult] = []
    for item in items:
        name = _optional_str(item.get("name"))
        if not name:
            results.append(BulkRowResult(id="?", ok=False, error="name is required"))
            continue
        try:
            sort_index = int(item.get("sort_index", 0) or 0)
            created = menu.create_category(
                CategoryCreate(
                    restaurant_id=ctx.restaurant_id,
                    name=name,
                    description=_optional_str(item.get("description")),
                    sort_index=sort_index,
                )
            )
            invalidate(ctx)
            results.append(
                BulkRowResult(
                    id=str(created.id),
                    ok=True,
                    label=created.name,
                    changed_fields=["name"],
                )
            )
        except (ValidationError, NotFoundError, ConflictError, TypeError, ValueError) as exc:
            results.append(BulkRowResult(id="?", ok=False, error=str(exc)))

    return bulk_tool_result(entity_label="category", results=results, verb="Added")
```

(Leave room in the same file for `bulk_create_products` in Task 3; stubs not required yet.)

Wire in `tools.py`:

1. Import `bulk_create_categories` from `bulk_create`.
2. Add `ToolDefinition` after `create_category` (or near other bulk category tools):

```python
ToolDefinition(
    name="bulk_create_categories",
    description=(
        "Create MANY categories in one call. Each item needs name; optional "
        f"description and sort_index. Up to {BULK_DEFAULT_LIMIT} items. "
        "Use when the owner already listed several categories — no per-item recap."
    ),
    effect="mutate",
    input_schema={
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "sort_index": {"type": "integer"},
                    },
                    "required": ["name"],
                },
            },
        },
        "required": ["items"],
    },
),
```

3. In `execute`, after `create_category` branch (or with other bulks):

```python
if tool_name == "bulk_create_categories":
    return bulk_create_categories(
        service, ctx, args, invalidate=_finalize_menu_mutation
    )
```

Use the same `invalidate` callable already used by other bulk tools in this file (`_finalize_menu_mutation`).

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend && python -m pytest tests/modules/test_menu_write_tools.py::test_menu_write_bulk_create_categories tests/modules/test_menu_write_tools.py::test_menu_write_bulk_create_categories_partial_and_limit -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_write/bulk_create.py \
  backend/app/modules/assistant/skills/menu_write/tools.py \
  backend/tests/modules/test_menu_write_tools.py
git commit -m "feat(assistant): add bulk_create_categories menu_write tool"
```

---

### Task 3: `bulk_create_products` (name-only + nested complements)

**Files:**
- Modify: `backend/app/modules/assistant/skills/menu_write/bulk_create.py`
- Modify: `backend/app/modules/assistant/skills/menu_write/tools.py`
- Modify: `backend/tests/modules/test_menu_write_tools.py`

**Interfaces:**
- Consumes: Task 1 `create_product` empty-cats; `_parse_nested_option_items`; `OptionGroupCreate`; `ProductCreate`
- Produces: `bulk_create_products(menu, ctx, args, *, invalidate) -> ToolResult`

- [ ] **Step 1: Write failing skill tests**

Append:

```python
@requires_db
def test_menu_write_bulk_create_products_minimal(session):
    from app.core.pagination import PaginationParams

    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Create Prods", subdomain="menu-write-bulk-create-prods")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_create_products",
        {"items": [{"name": "Solo nombre"}, {"name": "Otro"}]},
        ctx,
    )
    assert result.ok is True
    assert result.data["updated"] == 2
    assert result.data["failed"] == 0

    page = uow.menu.list_products(
        restaurant.id, PaginationParams(limit=50, cursor=None), include_options=True
    )
    by_name = {p.name: p for p in page.items}
    assert by_name["Solo nombre"].price_cents == 0
    assert by_name["Solo nombre"].status == "active"
    assert by_name["Solo nombre"].category_ids == []
    assert by_name["Otro"].price_cents == 0


@requires_db
def test_menu_write_bulk_create_products_with_categories_and_options(session):
    from app.core.pagination import PaginationParams

    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Create Full", subdomain="menu-write-bulk-create-full")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    result = skill.execute(
        "bulk_create_products",
        {
            "items": [
                {
                    "name": "Taco pastor",
                    "price_cents": 2500,
                    "category_names": ["Tacos"],
                    "description": "Con piña",
                    "option_groups": [
                        {
                            "title": "Extras",
                            "selection": "multi",
                            "items": [
                                {"label": "Queso", "price_delta_cents": 1000},
                                {"label": "Guacamole", "price_delta_cents": 1500},
                            ],
                        }
                    ],
                },
                {
                    "name": "Agua",
                    "category_ids": [str(category.id)],
                    "price_cents": 2000,
                },
                {"name": ""},  # fail row
            ]
        },
        ctx,
    )
    assert result.ok is True
    assert result.data["updated"] == 2
    assert result.data["failed"] == 1

    page = uow.menu.list_products(
        restaurant.id, PaginationParams(limit=50, cursor=None), include_options=True
    )
    pastor = next(p for p in page.items if p.name == "Taco pastor")
    assert pastor.price_cents == 2500
    assert category.id in pastor.category_ids
    extras = next(g for g in pastor.option_groups if g.title == "Extras")
    assert {i.label for i in extras.items} == {"Queso", "Guacamole"}


@requires_db
def test_menu_write_bulk_create_products_over_limit(session):
    from app.modules.assistant.skills.menu_write.bulk import BULK_DEFAULT_LIMIT

    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Create Limit", subdomain="menu-write-bulk-create-limit")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    over = MenuWriteSkill().execute(
        "bulk_create_products",
        {"items": [{"name": f"P{i}"} for i in range(BULK_DEFAULT_LIMIT + 1)]},
        ctx,
    )
    assert over.ok is False
    assert "At most" in over.summary
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend && python -m pytest \
  tests/modules/test_menu_write_tools.py::test_menu_write_bulk_create_products_minimal \
  tests/modules/test_menu_write_tools.py::test_menu_write_bulk_create_products_with_categories_and_options \
  tests/modules/test_menu_write_tools.py::test_menu_write_bulk_create_products_over_limit -v
```

Expected: FAIL — unknown tool.

- [ ] **Step 3: Implement `bulk_create_products`**

Add to `bulk_create.py`:

```python
def _resolve_row_category_ids(
    menu: MenuService,
    ctx: AgentContext,
    item: dict[str, Any],
) -> tuple[list[uuid.UUID], str | None]:
    """Resolve optional category_ids and/or category_names for one product row."""
    ids: list[uuid.UUID] = []
    raw_ids = item.get("category_ids")
    if raw_ids is not None:
        if not isinstance(raw_ids, list):
            return [], "category_ids must be a list"
        for entry in raw_ids:
            parsed = _parse_uuid(entry)
            if parsed is None:
                return [], f"Invalid category_id: {entry!r}"
            ids.append(parsed)

    names = item.get("category_names")
    if names is None:
        return ids, None
    if not isinstance(names, list):
        return [], "category_names must be a list"
    if not names and raw_ids is None:
        return ids, None

    page = menu.list_all_categories(
        ctx.restaurant_id,
        PaginationParams(limit=200, cursor=None),
    )
    for name in names:
        label = _optional_str(name)
        if not label:
            return [], "Each category_names entry must be a string"
        needle = label.casefold()
        matches = [c for c in page.items if c.name.casefold() == needle]
        if len(matches) != 1:
            if len(matches) > 1:
                labels = ", ".join(c.name for c in matches[:5])
                return [], f"Ambiguous category name {label!r}; candidates: {labels}"
            return [], f"Category not found for name {label!r}"
        if matches[0].id not in ids:
            ids.append(matches[0].id)
    return ids, None


def _parse_row_option_groups(
    raw: Any,
) -> tuple[list[OptionGroupCreate], str | None]:
    if raw is None:
        return [], None
    if not isinstance(raw, list):
        return [], "option_groups must be a list"
    groups: list[OptionGroupCreate] = []
    for entry in raw:
        if not isinstance(entry, dict):
            return [], "Each option_groups entry must be an object"
        title = _optional_str(entry.get("title"))
        if not title:
            return [], "Each option group requires a title"
        nested_items, nested_err = _parse_nested_option_items(entry.get("items"))
        if nested_err:
            return [], nested_err
        selection = str(entry.get("selection") or "single")
        if selection not in {"single", "multi"}:
            return [], "selection must be single or multi"
        try:
            max_selections = (
                int(entry["max_selections"]) if entry.get("max_selections") is not None else None
            )
            groups.append(
                OptionGroupCreate(
                    title=title,
                    required=bool(entry.get("required", False)),
                    selection=selection,
                    min_selections=int(entry.get("min_selections", 0) or 0),
                    max_selections=max_selections,
                    sort_index=int(entry.get("sort_index", 0) or 0),
                    items=nested_items,
                )
            )
        except (TypeError, ValueError) as exc:
            return [], str(exc)
    return groups, None


def bulk_create_products(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw = _resolve_items_arg(args, "items", "products")
    items, err = _parse_items(raw, max_items=BULK_DEFAULT_LIMIT, entity_label="product")
    if err:
        return ToolResult(ok=False, summary=err)

    results: list[BulkRowResult] = []
    for item in items:
        name = _optional_str(item.get("name"))
        if not name:
            results.append(BulkRowResult(id="?", ok=False, error="name is required"))
            continue

        category_ids, cat_err = _resolve_row_category_ids(menu, ctx, item)
        if cat_err:
            results.append(BulkRowResult(id="?", ok=False, error=cat_err))
            continue

        option_groups, groups_err = _parse_row_option_groups(item.get("option_groups"))
        if groups_err:
            results.append(BulkRowResult(id="?", ok=False, error=groups_err))
            continue

        try:
            price_raw = item.get("price_cents", 0)
            price_cents = int(0 if price_raw is None else price_raw)
            if price_cents < 0:
                results.append(
                    BulkRowResult(id="?", ok=False, error="price_cents must be >= 0")
                )
                continue
            status = str(item.get("status") or "active")
            if status not in {"active", "inactive", "draft"}:
                results.append(BulkRowResult(id="?", ok=False, error="invalid status"))
                continue

            created = menu.create_product(
                ctx.restaurant_id,
                ProductCreate(
                    restaurant_id=ctx.restaurant_id,
                    name=name,
                    description=_optional_str(item.get("description")),
                    price_cents=price_cents,
                    currency=str(item.get("currency") or "MXN"),
                    image_path=_optional_str(item.get("image_path")),
                    status=status,  # type: ignore[arg-type]
                    category_ids=category_ids,
                ),
            )
            invalidate(ctx)

            for group in option_groups:
                menu.add_option_group(ctx.restaurant_id, created.id, group)
                invalidate(ctx)

            changed = ["name", "price_cents", "status"]
            if option_groups:
                changed.append("option_groups")
            results.append(
                BulkRowResult(
                    id=str(created.id),
                    ok=True,
                    label=created.name,
                    changed_fields=changed,
                )
            )
        except (ValidationError, NotFoundError, ConflictError, TypeError, ValueError) as exc:
            # If create succeeded but add_option_group failed, product remains;
            # exception path after create is rare — surface error; row ok=false.
            results.append(
                BulkRowResult(
                    id=str(created.id) if "created" in dir() else "?",
                    ok=False,
                    error=str(exc),
                    label=name,
                )
            )
```

Fix the except branch carefully — do **not** use `"created" in dir()`. Use an explicit pattern:

```python
        created = None
        try:
            created = menu.create_product(...)
            invalidate(ctx)
            for group in option_groups:
                menu.add_option_group(ctx.restaurant_id, created.id, group)
                invalidate(ctx)
            results.append(BulkRowResult(id=str(created.id), ok=True, label=created.name, ...))
        except (ValidationError, NotFoundError, ConflictError, TypeError, ValueError) as exc:
            results.append(
                BulkRowResult(
                    id=str(created.id) if created is not None else "?",
                    ok=False,
                    error=str(exc),
                    label=name,
                )
            )
```

Wire `ToolDefinition` + execute dispatch in `tools.py` (near `create_product` / product bulks):

```python
ToolDefinition(
    name="bulk_create_products",
    description=(
        "Create MANY complete products in one call. Only name is required per item; "
        "omitted price_cents defaults to 0; status defaults to active (live menu); "
        "categories optional (category_ids and/or category_names); optional nested "
        f"option_groups[].items[] for complements. Up to {BULK_DEFAULT_LIMIT} products. "
        "Use when the owner already listed several products — no per-item recap."
    ),
    effect="mutate",
    input_schema={
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "price_cents": {"type": "integer"},
                        "description": {"type": "string"},
                        "image_path": {"type": "string"},
                        "currency": {"type": "string"},
                        "status": {
                            "type": "string",
                            "enum": ["active", "inactive", "draft"],
                        },
                        "category_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "category_names": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "option_groups": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string"},
                                    "required": {"type": "boolean"},
                                    "selection": {
                                        "type": "string",
                                        "enum": ["single", "multi"],
                                    },
                                    "min_selections": {"type": "integer"},
                                    "max_selections": {"type": "integer"},
                                    "sort_index": {"type": "integer"},
                                    "items": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "label": {"type": "string"},
                                                "price_delta_cents": {"type": "integer"},
                                                "sort_index": {"type": "integer"},
                                            },
                                            "required": ["label"],
                                        },
                                    },
                                },
                                "required": ["title"],
                            },
                        },
                    },
                    "required": ["name"],
                },
            },
        },
        "required": ["items"],
    },
),
```

```python
if tool_name == "bulk_create_products":
    return bulk_create_products(
        service, ctx, args, invalidate=_finalize_menu_mutation
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend && python -m pytest \
  tests/modules/test_menu_write_tools.py::test_menu_write_bulk_create_products_minimal \
  tests/modules/test_menu_write_tools.py::test_menu_write_bulk_create_products_with_categories_and_options \
  tests/modules/test_menu_write_tools.py::test_menu_write_bulk_create_products_over_limit \
  tests/modules/test_menu_write_tools.py::test_menu_write_bulk_create_categories \
  tests/services/test_menu_service.py::test_create_product_allows_empty_categories -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_write/bulk_create.py \
  backend/app/modules/assistant/skills/menu_write/tools.py \
  backend/tests/modules/test_menu_write_tools.py
git commit -m "feat(assistant): add bulk_create_products with nested option groups"
```

---

### Task 4: SKILL.md + tool_catalog

**Files:**
- Modify: `backend/app/modules/assistant/skills/menu_write/SKILL.md`
- Modify: `backend/app/modules/assistant/agent/workflow/tool_catalog.py`

**Interfaces:**
- Consumes: tool names from Tasks 2–3
- Produces: agent-facing docs + compact catalog entries for `catalog_agent`

- [ ] **Step 1: Update SKILL.md**

In Safety rules bulk bullet, add create:

> for many **new** products (with optional nested complements) use `bulk_create_products`; for many **new** categories use `bulk_create_categories`; …

After the secretary section (or in Available tools), add a short section:

```markdown
## Bulk create (lista ya dada)

When the owner pastes or lists **several** products or categories to add, call
`bulk_create_products` / `bulk_create_categories` **directly** — no per-item secretary
recap. Only `name` is required per product; missing price → 0; new products default to
`active` on the live menu; categories optional. Nest `option_groups[].items[]` on each
product when complements are known. Prefer these over looping `create_product` /
`create_category`. Single-product conversational alta still uses the secretary flow.
```

Add table rows:

| `bulk_create_categories` | Create up to 50 categories (`items[]` with `name`; optional `description`, `sort_index`) |
| `bulk_create_products` | Create up to 50 products (`name` required; price default 0; status default `active`; optional cats + nested `option_groups`) |

- [ ] **Step 2: Update tool_catalog.py**

In `TOOL_GROUPS` under `"Write menu — categories & products"`, insert after `create_product` / near creates:

```python
"bulk_create_categories",
"bulk_create_products",
```

In return hints dict:

```python
"bulk_create_categories": "updated, failed, results[] per row (Added).",
"bulk_create_products": "updated, failed, results[] per row (Added); may include option_groups.",
```

- [ ] **Step 3: Sanity check catalog builds**

Run:

```bash
cd backend && python -c "from app.modules.assistant.agent.workflow.tool_catalog import build_executor_tool_catalog; t=build_executor_tool_catalog(); assert 'bulk_create_products' in t and 'bulk_create_categories' in t; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_write/SKILL.md \
  backend/app/modules/assistant/agent/workflow/tool_catalog.py
git commit -m "docs(assistant): document bulk_create_products and bulk_create_categories"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `bulk_create_categories` in MenuWriteSkill | 2 |
| `bulk_create_products` with nested option_groups | 3 |
| name-only product; price 0; status active | 3 |
| empty categories on create | 1 + 3 |
| partial success / 50 limit | 2 + 3 |
| no rollback on complement failure | 3 (except after create) |
| SKILL.md direct-create guidance | 4 |
| tool_catalog hints | 4 |
| update_product still requires cats | 1 (unchanged) |
| no new HTTP API / no new skills | all |

## Placeholder / consistency self-review

- No TBD/TODO left in steps.
- `bulk_tool_result` verb `"Added"` matches existing `bulk_add_*` tools (`updated`/`failed` keys unchanged).
- `_parse_nested_option_items` imported from `option_item_bulk` (private but same package pattern as `_parse_items` from `bulk`).
- Invalidate callback: `_finalize_menu_mutation` (same as other bulk tools in `tools.py`).

## 2026-07-30 — Bulk-create products/categories final review fixes

### Changes

- Corrected the executor catalog: retained only the `bulk_create_categories` and
  `bulk_create_products` additions, restored the committed `generate_product_image` name, and
  removed the phantom restaurant-settings catalog entries.
- Validated nested option-group cardinality before `create_product`, so invalid `single` groups
  with `max_selections > 1` fail their row without creating a product. If a later option-group
  insertion fails after creation, the row error now explicitly identifies the created product ID.
- Documented that bulk products default to `active`, price defaults to zero, and uncategorized
  products remain off the public/live menu until assigned to a category.
- Moved over-limit assertions to non-DB tests.

### Commit

- `763bdc9 fix(assistant): correct bulk creation review findings`

### Tests

- `cd backend && .venv/bin/python -m pytest tests/modules/test_menu_write_bulk_create.py -q`
  — 3 passed.
- `cd backend && .venv/bin/python -m pytest tests/modules/test_menu_write_tools.py -k bulk_create -q`
  — 1 passed, 4 skipped (Postgres-dependent tests were skipped; no database pass is claimed).
- `cd backend && .venv/bin/python -m ruff check app/modules/assistant/skills/menu_write/bulk_create.py app/modules/assistant/agent/workflow/tool_catalog.py tests/modules/test_menu_write_bulk_create.py`
  — passed.
- Required catalog command — failed in the active worktree because unrelated uncommitted
  `menu_media/tools.py` renames the committed `generate_product_image` tool to
  `generate_food_product_image`. The fix commit intentionally restores the catalog to the
  committed name and does not include that unrelated WIP.

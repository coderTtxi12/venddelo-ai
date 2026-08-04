# OCR Menu → Bulk Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only `ocr_menu_to_bulk_products` to `MenuWriteSkill` so `catalog_agent` can OCR chat-uploaded menu images into `{ items: [...] }` for `bulk_create_products`.

**Architecture:** New helper module loads inbox `storage_paths` via `build_storage()`, calls `build_vision_provider().analyze_json` with `settings.openai_vision_model` and a bulk-products prompt, normalizes/merges items, returns `ToolResult` without mutating the menu.

**Tech Stack:** Python, VisionPort/OpenAI vision, MenuWriteSkill tools, pytest with stub vision + fake storage.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-ocr-menu-to-bulk-products-design.es.md`
- Effect: `read` only — never call `bulk_create_*` inside this tool
- Model: `settings.openai_vision_model` (`OPENAI_VISION_MODEL`)
- Input: 1–5 `storage_paths` (or alias `storage_path`); tenant inbox/assignable prefixes via `validate_assignable_image_path`
- Output: `{ items, source_count, item_count, failed_paths, model }`; only `category_names` (no invented UUIDs)
- Missing price → `price_cents = 0`
- Normalize aliases: `pricedeltacents` → `price_delta_cents`
- Commits: prepare clean diffs; skip `git commit` if the human prefers to commit themselves

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/modules/assistant/skills/menu_write/ocr_bulk_products.py` | Prompt, OCR loop, normalize, merge, public `ocr_menu_to_bulk_products` |
| `backend/app/modules/assistant/skills/menu_write/tools.py` | ToolDefinition + execute dispatch |
| `backend/app/modules/assistant/skills/menu_write/SKILL.md` | Agent guidance |
| `backend/app/modules/assistant/agent/workflow/tool_catalog.py` | Group + return hint |
| `backend/tests/modules/test_ocr_menu_to_bulk_products.py` | Unit/integration tests with stubs |

---

### Task 1: OCR helper + unit tests

**Files:**
- Create: `backend/app/modules/assistant/skills/menu_write/ocr_bulk_products.py`
- Create: `backend/tests/modules/test_ocr_menu_to_bulk_products.py`

**Interfaces:**
- Consumes: `VisionPort.analyze_json`, `build_vision_provider`, `build_storage`, `validate_assignable_image_path`, `get_settings().openai_vision_model`, `AgentContext`, `ToolResult`
- Produces:
  - `OCR_BULK_MAX_PATHS = 5`
  - `build_bulk_products_ocr_prompt() -> str`
  - `normalize_bulk_product_items(raw: Any) -> list[dict[str, Any]]`
  - `ocr_menu_to_bulk_products(ctx, args, *, vision=None, storage=None) -> ToolResult`

- [ ] **Step 1: Write failing unit tests**

Create `backend/tests/modules/test_ocr_menu_to_bulk_products.py`:

```python
from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.core.storage import StorageError
from app.core.vision.ports import VisionAnalysisRequest, VisionAnalysisResult, VisionPort
from app.modules.assistant.import_asset_paths import import_inbox_prefix
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_write.ocr_bulk_products import (
    OCR_BULK_MAX_PATHS,
    normalize_bulk_product_items,
    ocr_menu_to_bulk_products,
)


class StubVision(VisionPort):
    def __init__(self, payloads: dict[str, dict[str, Any]] | None = None, *, fail: set[str] | None = None):
        self.payloads = payloads or {}
        self.fail = fail or set()
        self.calls: list[VisionAnalysisRequest] = []

    def analyze_json(self, request: VisionAnalysisRequest) -> VisionAnalysisResult:
        self.calls.append(request)
        # Tests pass a marker in prompt or use sequential payloads — simpler: key by call index
        raise NotImplementedError


class SequentialStubVision(VisionPort):
    def __init__(self, responses: list[dict[str, Any] | Exception]):
        self.responses = list(responses)
        self.calls: list[VisionAnalysisRequest] = []

    def analyze_json(self, request: VisionAnalysisRequest) -> VisionAnalysisResult:
        self.calls.append(request)
        assert request.model  # must pass OPENAI_VISION_MODEL
        next_item = self.responses.pop(0)
        if isinstance(next_item, Exception):
            raise next_item
        return VisionAnalysisResult(data=next_item, model=request.model or "stub", raw_text="{}")


class FakeStorage:
    def __init__(self, files: dict[str, bytes]):
        self.files = files

    def read(self, path: str) -> bytes:
        if path not in self.files:
            raise StorageError(f"missing {path}")
        return self.files[path]


def _ctx(restaurant_id: uuid.UUID | None = None) -> AgentContext:
    rid = restaurant_id or uuid.uuid4()
    return AgentContext(
        restaurant_id=rid,
        conversation_id=uuid.uuid4(),
        uow=MagicMock(),
        effective_skill_ids=["menu_write"],
    )


def test_normalize_requires_name_and_aliases_price_delta():
    items = normalize_bulk_product_items(
        {
            "items": [
                {"name": "Taco", "pricecents": 2500, "option_groups": [
                    {"title": "Extras", "selection": "multi", "items": [
                        {"label": "Queso", "pricedeltacents": 1000}
                    ]}
                ]},
                {"price_cents": 100},  # drop — no name
            ]
        }
    )
    assert len(items) == 1
    assert items[0]["price_cents"] == 2500
    assert items[0]["option_groups"][0]["items"][0]["price_delta_cents"] == 1000
    assert "category_ids" not in items[0]


def test_ocr_rejects_too_many_paths():
    ctx = _ctx()
    prefix = import_inbox_prefix(ctx.restaurant_id)
    paths = [f"{prefix}{i}.webp" for i in range(OCR_BULK_MAX_PATHS + 1)]
    result = ocr_menu_to_bulk_products(
        ctx,
        {"storage_paths": paths},
        vision=SequentialStubVision([]),
        storage=FakeStorage({}),
    )
    assert result.ok is False
    assert "at most" in result.summary.lower() or str(OCR_BULK_MAX_PATHS) in result.summary


def test_ocr_happy_path_single_image():
    ctx = _ctx()
    path = f"{import_inbox_prefix(ctx.restaurant_id)}menu.webp"
    vision = SequentialStubVision(
        [{"items": [{"name": "Agua", "price_cents": 3000, "category_names": ["Bebidas"]}]}]
    )
    storage = FakeStorage({path: b"fake-bytes"})
    result = ocr_menu_to_bulk_products(
        ctx,
        {"storage_path": path},
        vision=vision,
        storage=storage,
    )
    assert result.ok is True
    assert result.data["item_count"] == 1
    assert result.data["items"][0]["name"] == "Agua"
    assert result.data["source_count"] == 1
    assert len(vision.calls) == 1
    assert vision.calls[0].image_bytes == b"fake-bytes"


def test_ocr_merges_two_images_and_collects_failures():
    from app.core.vision.ports import VisionError

    ctx = _ctx()
    p1 = f"{import_inbox_prefix(ctx.restaurant_id)}a.webp"
    p2 = f"{import_inbox_prefix(ctx.restaurant_id)}b.webp"
    p3 = f"{import_inbox_prefix(ctx.restaurant_id)}c.webp"
    vision = SequentialStubVision(
        [
            {"items": [{"name": "Uno", "price_cents": 100}]},
            VisionError("boom"),
            {"items": [{"name": "Dos", "price_cents": 200}]},
        ]
    )
    storage = FakeStorage({p1: b"1", p2: b"2", p3: b"3"})
    result = ocr_menu_to_bulk_products(
        ctx,
        {"storage_paths": [p1, p2, p3]},
        vision=vision,
        storage=storage,
    )
    assert result.ok is True
    assert result.data["item_count"] == 2
    names = {i["name"] for i in result.data["items"]}
    assert names == {"Uno", "Dos"}
    assert any(f["storage_path"] == p2 for f in result.data["failed_paths"])


def test_ocr_invalid_path_does_not_call_vision():
    ctx = _ctx()
    vision = SequentialStubVision([])
    result = ocr_menu_to_bulk_products(
        ctx,
        {"storage_path": "evil/path.webp"},
        vision=vision,
        storage=FakeStorage({}),
    )
    assert result.ok is False
    assert vision.calls == []
    assert result.data and result.data.get("failed_paths")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && .venv/bin/python -m pytest tests/modules/test_ocr_menu_to_bulk_products.py -v
```

Expected: FAIL — import/module missing.

- [ ] **Step 3: Implement `ocr_bulk_products.py`**

Create `backend/app/modules/assistant/skills/menu_write/ocr_bulk_products.py` with:

1. `OCR_BULK_MAX_PATHS = 5`
2. `build_bulk_products_ocr_prompt()` — Spanish/English instructions + minimal JSON example with `items`, `option_groups`, `price_cents`, `category_names`; forbid inventing `category_ids`.
3. `normalize_bulk_product_items(raw)` — accept dict with `items` or bare list; strip `category_ids`; alias keys; default `price_cents=0`; validate option groups lightly.
4. `_resolve_paths(args)` — from `storage_paths` or `storage_path`.
5. `_media_type(path)` — reuse pattern from `menu_intelligence.image_loader.product_image_media_type` (import or copy small helper).
6. `ocr_menu_to_bulk_products(ctx, args, *, vision=None, storage=None)`:
   - resolve paths; if empty or >5 → `ToolResult(ok=False, ...)`
   - `vision = vision or build_vision_provider()`; `storage = storage or build_storage()`
   - `model = get_settings().openai_vision_model`
   - for each path: `validate_assignable_image_path` → read → `analyze_json(VisionAnalysisRequest(prompt=..., image_bytes=..., image_media_type=..., model=model))` → normalize → extend items
   - on ValidationError/StorageError/VisionError: append to `failed_paths`, continue
   - soft dedupe by `(name.casefold(), first category_name.casefold() if any)`
   - return ok if `items` non-empty

Key normalize snippet:

```python
def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return n if n >= 0 else default


def _normalize_item(raw: dict[str, Any]) -> dict[str, Any] | None:
    name = str(raw.get("name") or "").strip()
    if not name:
        return None
    price = raw.get("price_cents", raw.get("pricecents", raw.get("priceCents", 0)))
    item: dict[str, Any] = {
        "name": name,
        "price_cents": _coerce_int(price, 0),
    }
    # description, category_names, option_groups…; never copy category_ids
    ...
    return item
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && .venv/bin/python -m pytest tests/modules/test_ocr_menu_to_bulk_products.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_write/ocr_bulk_products.py \
  backend/tests/modules/test_ocr_menu_to_bulk_products.py
git commit -m "feat(assistant): add ocr_menu_to_bulk_products helper"
```

---

### Task 2: Wire ToolDefinition + dispatch

**Files:**
- Modify: `backend/app/modules/assistant/skills/menu_write/tools.py`
- Modify: `backend/tests/modules/test_ocr_menu_to_bulk_products.py` (registration smoke test)

**Interfaces:**
- Consumes: `ocr_menu_to_bulk_products` from Task 1
- Produces: tool registered on `MenuWriteSkill` with `effect="read"`

- [ ] **Step 1: Write failing registration test**

```python
from app.modules.assistant.skills.menu_write.tools import MenuWriteSkill

def test_menu_write_registers_ocr_menu_to_bulk_products():
    tools = {t.name: t for t in MenuWriteSkill().tool_definitions()}
    assert "ocr_menu_to_bulk_products" in tools
    assert tools["ocr_menu_to_bulk_products"].effect == "read"
```

- [ ] **Step 2: Run to verify fail**

```bash
cd backend && .venv/bin/python -m pytest tests/modules/test_ocr_menu_to_bulk_products.py::test_menu_write_registers_ocr_menu_to_bulk_products -v
```

- [ ] **Step 3: Wire tools.py**

Import `ocr_menu_to_bulk_products`. Add `ToolDefinition` near `bulk_create_products`:

```python
ToolDefinition(
    name="ocr_menu_to_bulk_products",
    description=(
        "OCR one or more uploaded menu images (storage_path from chat attachments) into "
        "JSON {items:[...]} ready for bulk_create_products. Read-only — does not create "
        "products. Pass storage_paths (1-5) or storage_path. Uses OPENAI_VISION_MODEL. "
        "After OCR, create missing categories then call bulk_create_products (split if >50)."
    ),
    effect="read",
    input_schema={
        "type": "object",
        "properties": {
            "storage_paths": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 1,
                "maxItems": 5,
            },
            "storage_path": {
                "type": "string",
                "description": "Alias for a single path when storage_paths is omitted.",
            },
        },
        "required": [],
    },
),
```

Dispatch (no invalidate — read-only):

```python
if tool_name == "ocr_menu_to_bulk_products":
    return ocr_menu_to_bulk_products(ctx, args)
```

- [ ] **Step 4: Run tests**

```bash
cd backend && .venv/bin/python -m pytest tests/modules/test_ocr_menu_to_bulk_products.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_write/tools.py \
  backend/tests/modules/test_ocr_menu_to_bulk_products.py
git commit -m "feat(assistant): register ocr_menu_to_bulk_products tool"
```

---

### Task 3: SKILL.md + tool_catalog

**Files:**
- Modify: `backend/app/modules/assistant/skills/menu_write/SKILL.md`
- Modify: `backend/app/modules/assistant/agent/workflow/tool_catalog.py`

**Interfaces:**
- Consumes: tool name from Task 2
- Produces: agent docs + catalog hints

- [ ] **Step 1: Update SKILL.md**

Add section after bulk create:

```markdown
## OCR de menú → bulk create

When the owner uploads menu photo(s) to add many products:
1. Call `ocr_menu_to_bulk_products` with attachment `storage_path`(s) (up to 5).
2. Review returned `items`; if `item_count` > 50, split before create.
3. Ensure categories exist (`bulk_create_categories` for missing `category_names`).
4. Call `bulk_create_products` with the items (or batches).

Read-only OCR — never treat this tool as a write. Prefer this over pasting giant JSON in chat.
```

Add table row:

| `ocr_menu_to_bulk_products` | OCR chat menu images → `{items}` for `bulk_create_products` (1–5 `storage_paths`; read-only) |

- [ ] **Step 2: Update tool_catalog.py**

In `"Write menu — categories & products"` group, add `"ocr_menu_to_bulk_products"` near bulk creates.

Return hint:

```python
"ocr_menu_to_bulk_products": "items[], item_count, source_count, failed_paths[], model.",
```

- [ ] **Step 3: Sanity check**

```bash
cd backend && .venv/bin/python -c "
from app.modules.assistant.agent.workflow.tool_catalog import build_executor_tool_catalog
t=build_executor_tool_catalog()
assert 'ocr_menu_to_bulk_products' in t
assert 'Missing tool definitions' not in t or 'ocr_menu_to_bulk_products' not in t.split('Missing')[1]
print('ok')
"
```

If WIP causes missing tools for *other* names, still assert `ocr_menu_to_bulk_products` is present and has a returns hint.

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_write/SKILL.md \
  backend/app/modules/assistant/agent/workflow/tool_catalog.py
git commit -m "docs(assistant): document ocr_menu_to_bulk_products"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Tool in MenuWriteSkill, effect read | 2 |
| storage_paths 1–5 / storage_path alias | 1 |
| OPENAI_VISION_MODEL | 1 |
| Return items shape for bulk_create | 1 |
| No mutate / no category_ids from OCR | 1 |
| Partial failure + merge | 1 |
| Alias normalization | 1 |
| SKILL + catalog | 3 |

## Placeholder / consistency self-review

- No TBD left.
- Invalidate not used (read tool).
- FakeStorage only needs `read`; inject via kwargs so tests avoid real S3.

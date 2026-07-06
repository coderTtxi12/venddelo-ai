# Menu Import Concierge Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `menu_import` into a concierge one-shot flow: optimize the full draft, show a single preview, apply the entire menu in one confirmation, assign owner-uploaded photos (no AI product images), and auto-generate NxM promo banners.

**Architecture:** Reuse existing extraction, batching, and `apply_import_batch` internals. Add `draft_merge`, `optimization`, and `preview_full` modules. New tools `optimize_import_draft`, `preview_full_import`, `apply_full_import` orchestrate the concierge path. Store optimization metadata in existing session JSONB fields (`discovery_answers`, `selected_theme_id`) — no new migration. Extend `apply_batch` to publish products and set category `display_layout`.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, existing `LLMProviderPort` / `VisionPort`, `MenuService`, `PromotionService`, pytest.

**Spec:** [`docs/superpowers/specs/2026-07-06-menu-import-concierge-redesign.es.md`](../specs/2026-07-06-menu-import-concierge-redesign.es.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `app/modules/assistant/skills/menu_import/draft_schema.py` | Add `display_layout` on categories, `sort_order` on products |
| `app/modules/assistant/skills/menu_import/draft_merge.py` | Merge `draft_batches[]` → single `ImportDraft` |
| `app/modules/assistant/skills/menu_import/optimization_prompt.py` | LLM prompt for layout/order/copy optimization |
| `app/modules/assistant/skills/menu_import/optimization.py` | Run optimization + theme recommendation |
| `app/modules/assistant/skills/menu_import/preview_full.py` | Executive markdown preview for full menu |
| `app/modules/assistant/skills/menu_import/apply_batch.py` | `apply_full_import`, publish products, `display_layout` |
| `app/modules/assistant/skills/menu_import/session_schemas.py` | Add `OPTIMIZING` status |
| `app/modules/assistant/skills/menu_import/tools.py` | Register + wire 3 new tools; fix clarification status |
| `app/modules/assistant/skills/menu_import/SKILL.md` | Concierge workflow |
| `app/modules/assistant/skills/promotions/SKILL.md` | Auto-banner note during import |
| `app/core/config.py` | `menu_import_full_max_products` |
| `tests/modules/test_menu_import_draft_merge.py` | Merge batches tests |
| `tests/modules/test_menu_import_optimize.py` | Optimization + schema tests |
| `tests/modules/test_menu_import_preview_full.py` | Preview markdown tests |
| `tests/modules/test_menu_import_apply.py` | `apply_full_import` tests |
| `tests/modules/test_menu_import_tools.py` | Tool registry count + handlers |
| `tests/modules/test_menu_import_skill_md.py` | SKILL.md workflow assertions |

---

### Task 1: Config and schema extensions

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env.example`
- Modify: `backend/app/modules/assistant/skills/menu_import/draft_schema.py`
- Modify: `backend/app/modules/assistant/skills/menu_import/session_schemas.py`
- Test: `backend/tests/modules/test_menu_import_optimize.py`

- [ ] **Step 1: Write failing schema test**

```python
# backend/tests/modules/test_menu_import_optimize.py
from app.modules.assistant.skills.menu_import.draft_schema import ImportCategory, ImportDraft


def test_import_category_accepts_display_layout():
    cat = ImportCategory(
        ref="cat_1",
        name="Alitas",
        sort_order=1,
        display_layout="grid",
        products=[],
    )
    assert cat.display_layout == "grid"


def test_import_product_accepts_sort_order():
    from app.modules.assistant.skills.menu_import.draft_schema import ImportProduct

    prod = ImportProduct(ref="p1", name="Boneless", sort_order=3, price_mxn=199)
    assert prod.sort_order == 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_optimize.py -v`  
Expected: FAIL — `display_layout` / `sort_order` unexpected keyword

- [ ] **Step 3: Extend schema and config**

```python
# draft_schema.py — ImportCategory
from typing import Literal

DisplayLayout = Literal["vertical", "horizontal", "grid"]

class ImportCategory(BaseModel):
    ref: str
    name: str
    description: str | None = None
    sort_order: int = 0
    display_layout: DisplayLayout | None = None
    products: list[ImportProduct] = Field(default_factory=list)


class ImportProduct(BaseModel):
    ref: str
    name: str
    description: str | None = None
    price_mxn: float = 0
    currency: str = "MXN"
    is_available: bool = True
    sort_order: int = 0
    option_groups: list[ImportOptionGroup] = Field(default_factory=list)
    constraints_notes: str | None = None
```

```python
# session_schemas.py — add after CLARIFYING
OPTIMIZING = "optimizing"
```

```python
# config.py
menu_import_full_max_products: int = 200
```

```env
# .env.example
MENU_IMPORT_FULL_MAX_PRODUCTS=200
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_optimize.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/config.py backend/.env.example \
  backend/app/modules/assistant/skills/menu_import/draft_schema.py \
  backend/app/modules/assistant/skills/menu_import/session_schemas.py \
  backend/tests/modules/test_menu_import_optimize.py
git commit -m "feat(menu_import): extend draft schema for concierge optimization"
```

---

### Task 2: Merge draft batches utility

**Files:**
- Create: `backend/app/modules/assistant/skills/menu_import/draft_merge.py`
- Test: `backend/tests/modules/test_menu_import_draft_merge.py`

- [ ] **Step 1: Write failing merge test**

```python
# backend/tests/modules/test_menu_import_draft_merge.py
from app.modules.assistant.skills.menu_import.draft_merge import merge_draft_batches
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, ImportCategory, ImportProduct


def test_merge_draft_batches_combines_categories_and_keeps_promos_from_first_batch():
    batches = [
        ImportBatch(
            batch_index=0,
            categories=[
                ImportCategory(
                    ref="cat_1",
                    name="Tacos",
                    products=[ImportProduct(ref="p1", name="Pastor", price_mxn=35)],
                )
            ],
            promotions=[{"ref": "promo_1", "name": "2x1", "type": "two_for_one", "scope": "product"}],
            global_rules=["Solo efectivo"],
            open_questions=[{"id": "q1", "question_es": "¿Horario?"}],
        ),
        ImportBatch(
            batch_index=1,
            categories=[
                ImportCategory(
                    ref="cat_2",
                    name="Bebidas",
                    products=[ImportProduct(ref="p2", name="Agua", price_mxn=20)],
                )
            ],
        ),
    ]
    draft = merge_draft_batches(batches)
    assert len(draft.categories) == 2
    assert draft.categories[0].name == "Tacos"
    assert draft.categories[1].name == "Bebidas"
    assert len(draft.promotions) == 1
    assert draft.global_rules == ["Solo efectivo"]
    assert len(draft.open_questions) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_draft_merge.py -v`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement merge**

```python
# backend/app/modules/assistant/skills/menu_import/draft_merge.py
from __future__ import annotations

from typing import Any

from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, ImportDraft
from app.modules.assistant.skills.menu_import.extraction import merge_page_drafts


def _batch_to_draft(batch: ImportBatch) -> ImportDraft:
    return ImportDraft(
        categories=batch.categories,
        promotions=batch.promotions,
        global_rules=batch.global_rules,
        unmapped_text=[],
        open_questions=batch.open_questions,
    )


def merge_draft_batches(batches: list[ImportBatch | dict[str, Any]]) -> ImportDraft:
    """Merge all import batches into one draft (promos/rules/questions from batch 0)."""
    models: list[ImportDraft] = []
    for index, entry in enumerate(batches):
        batch = entry if isinstance(entry, ImportBatch) else ImportBatch.model_validate(entry)
        draft = _batch_to_draft(batch)
        if index == 0:
            models.append(draft)
            continue
        models.append(
            ImportDraft(
                categories=draft.categories,
                promotions=[],
                global_rules=[],
                unmapped_text=[],
                open_questions=[],
            )
        )
    return merge_page_drafts(models)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_draft_merge.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_import/draft_merge.py \
  backend/tests/modules/test_menu_import_draft_merge.py
git commit -m "feat(menu_import): add draft batch merge utility"
```

---

### Task 3: Optimization prompt and module

**Files:**
- Create: `backend/app/modules/assistant/skills/menu_import/optimization_prompt.py`
- Create: `backend/app/modules/assistant/skills/menu_import/optimization.py`
- Modify: `backend/tests/modules/test_menu_import_optimize.py`

- [ ] **Step 1: Write failing optimization parse test**

```python
# append to test_menu_import_optimize.py
from app.modules.assistant.skills.menu_import.optimization import parse_optimization_response
from app.modules.assistant.skills.menu_import.draft_schema import ImportDraft, ImportCategory, ImportProduct


def test_parse_optimization_response_merges_layout_and_notes():
    base = ImportDraft(
        categories=[
            ImportCategory(
                ref="cat_1",
                name="Alitas",
                products=[ImportProduct(ref="p1", name="Boneless", price_mxn=199)],
            )
        ]
    )
    raw = {
        "categories": [
            {
                "ref": "cat_1",
                "sort_order": 0,
                "display_layout": "grid",
                "products": [
                    {"ref": "p1", "sort_order": 0, "description": "Crujientes con salsa."}
                ],
            }
        ],
        "optimization_notes_es": ["Promociones primero para ticket"],
        "recommended_theme_id": "taqueria-viva",
    }
    result = parse_optimization_response(base, raw)
    assert result.draft.categories[0].display_layout == "grid"
    assert result.draft.categories[0].products[0].description == "Crujientes con salsa."
    assert result.optimization_notes_es == ["Promociones primero para ticket"]
    assert result.recommended_theme_id == "taqueria-viva"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_optimize.py::test_parse_optimization_response_merges_layout_and_notes -v`  
Expected: FAIL

- [ ] **Step 3: Implement prompt + parser**

```python
# optimization_prompt.py
from __future__ import annotations

import json
from typing import Any


def build_optimization_prompt(draft: dict[str, Any], context: dict[str, Any]) -> str:
    discovery = context.get("discovery_answers") or {}
    return f"""You optimize a restaurant digital menu draft for conversion and clarity.
Apply menu_best_practices mentally: promos first, strong mains with complements, short appetizing
descriptions, sensible category layouts (grid for photo-heavy, horizontal for promos, vertical default).

Input draft (JSON, prices in MXN pesos):
{json.dumps(draft, ensure_ascii=False)}

Owner context:
{json.dumps(discovery, ensure_ascii=False)}

Rules:
- Keep all refs unchanged (cat_*, prod_*, og_*, oi_*, promo_*).
- Do NOT add or remove products/categories/promos.
- You MAY improve descriptions and set sort_order, display_layout, complement order.
- display_layout per category: "vertical" | "horizontal" | "grid".
- Return optimization_notes_es in Spanish (bullets for owner preview).
- Pick recommended_theme_id from catalog hint in context or null.

Return JSON only:
{{
  "categories": [{{"ref": "...", "sort_order": 0, "display_layout": "grid", "products": [{{"ref": "...", "sort_order": 0, "description": "..."}}]}}],
  "optimization_notes_es": ["string"],
  "recommended_theme_id": "theme-id-or-null"
}}
"""
```

```python
# optimization.py
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.core.llm.ports import ChatCompletionMessage, ChatCompletionRequest, LLMProviderPort
from app.infra.llm.factory import build_llm_provider
from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportCategory,
    ImportDraft,
    ImportProduct,
)
from app.modules.assistant.skills.menu_import.optimization_prompt import build_optimization_prompt


@dataclass(frozen=True, slots=True)
class OptimizationResult:
    draft: ImportDraft
    optimization_notes_es: list[str]
    recommended_theme_id: str | None


def _product_overrides_by_ref(category_payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    overrides: dict[str, dict[str, Any]] = {}
    for product in category_payload.get("products") or []:
        if isinstance(product, dict) and product.get("ref"):
            overrides[str(product["ref"])] = product
    return overrides


def parse_optimization_response(base: ImportDraft, raw: dict[str, Any]) -> OptimizationResult:
    category_payloads = {
        str(item["ref"]): item
        for item in (raw.get("categories") or [])
        if isinstance(item, dict) and item.get("ref")
    }
    optimized_categories: list[ImportCategory] = []
    for category in base.categories:
        payload = category_payloads.get(category.ref, {})
        product_overrides = _product_overrides_by_ref(payload)
        products: list[ImportProduct] = []
        for product in category.products:
            override = product_overrides.get(product.ref, {})
            products.append(
                product.model_copy(
                    update={
                        k: v
                        for k, v in {
                            "sort_order": override.get("sort_order"),
                            "description": override.get("description"),
                        }.items()
                        if v is not None
                    }
                )
            )
        products.sort(key=lambda p: (p.sort_order, p.name))
        layout = payload.get("display_layout")
        optimized_categories.append(
            category.model_copy(
                update={
                    k: v
                    for k, v in {
                        "sort_order": payload.get("sort_order"),
                        "display_layout": layout if layout in {"vertical", "horizontal", "grid"} else None,
                        "products": products,
                    }.items()
                    if v is not None
                }
            )
        )
    optimized_categories.sort(key=lambda c: (c.sort_order, c.name))
    notes = [
        str(item).strip()
        for item in (raw.get("optimization_notes_es") or [])
        if str(item).strip()
    ]
    theme_id = raw.get("recommended_theme_id")
    recommended = str(theme_id).strip() if theme_id else None
    return OptimizationResult(
        draft=base.model_copy(update={"categories": optimized_categories}),
        optimization_notes_es=notes,
        recommended_theme_id=recommended or None,
    )


def _collect_chat_json(provider: LLMProviderPort, request: ChatCompletionRequest) -> dict[str, Any]:
    content = ""
    for event in provider.stream_chat(request):
        if event.event == "message.complete":
            content = (event.data.get("content") or "").strip()
            break
    if not content:
        return {}
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def optimize_draft(
    draft: ImportDraft,
    context: dict[str, Any],
    *,
    llm: LLMProviderPort | None = None,
) -> OptimizationResult:
    provider = llm or build_llm_provider()
    prompt = build_optimization_prompt(draft.model_dump(), context)
    raw = _collect_chat_json(
        provider,
        ChatCompletionRequest(
            messages=[ChatCompletionMessage(role="user", content=prompt)],
            response_format={"type": "json_object"},
        ),
    )
    if not raw:
        return OptimizationResult(draft=draft, optimization_notes_es=[], recommended_theme_id=None)
    return parse_optimization_response(draft, raw)
```

- [ ] **Step 4: Run tests**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_optimize.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_import/optimization_prompt.py \
  backend/app/modules/assistant/skills/menu_import/optimization.py \
  backend/tests/modules/test_menu_import_optimize.py
git commit -m "feat(menu_import): add draft optimization LLM module"
```

---

### Task 4: Full import preview markdown

**Files:**
- Create: `backend/app/modules/assistant/skills/menu_import/preview_full.py`
- Test: `backend/tests/modules/test_menu_import_preview_full.py`

- [ ] **Step 1: Write failing preview test**

```python
# backend/tests/modules/test_menu_import_preview_full.py
from app.modules.assistant.skills.menu_import.draft_schema import ImportCategory, ImportDraft, ImportProduct
from app.modules.assistant.skills.menu_import.preview_full import build_full_import_preview


def test_build_full_import_preview_includes_layout_and_theme():
    draft = ImportDraft(
        categories=[
            ImportCategory(
                ref="c1",
                name="Alitas",
                sort_order=0,
                display_layout="grid",
                products=[ImportProduct(ref="p1", name="Boneless", price_mxn=199)],
            )
        ]
    )
    md = build_full_import_preview(
        draft,
        optimization_notes_es=["Promociones primero"],
        recommended_theme_id="original",
        theme_label="Original",
    )
    assert "Alitas" in md
    assert "grid" in md
    assert "Boneless" in md
    assert "$199" in md
    assert "Promociones primero" in md
    assert "Original" in md
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_preview_full.py -v`  
Expected: FAIL

- [ ] **Step 3: Implement preview**

```python
# backend/app/modules/assistant/skills/menu_import/preview_full.py
from __future__ import annotations

from app.modules.assistant.skills.menu_import.batching import count_batch_products
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, ImportDraft


def _format_price_mxn(mxn: float, currency: str = "MXN") -> str:
    return f"${mxn:,.2f} {currency}" if mxn % 1 else f"${mxn:,.0f} {currency}"


def build_full_import_preview(
    draft: ImportDraft,
    *,
    optimization_notes_es: list[str] | None = None,
    recommended_theme_id: str | None = None,
    theme_label: str | None = None,
) -> str:
    batch = ImportBatch(batch_index=0, categories=draft.categories, promotions=draft.promotions)
    product_count = count_batch_products(batch)
    complement_groups = sum(
        len(product.option_groups) for category in draft.categories for product in category.products
    )
    lines = [
        "## Tu menú digital quedaría así",
        "",
        f"**Productos:** {product_count} · todos activos y publicados",
        f"**Complementos:** {complement_groups} grupo(s)",
        f"**Promociones:** {len(draft.promotions)}",
        "",
        "### Categorías (orden optimizado)",
    ]
    for index, category in enumerate(
        sorted(draft.categories, key=lambda c: (c.sort_order, c.name)), start=1
    ):
        layout = category.display_layout or "vertical"
        lines.append(f"{index}. **{category.name}** — layout `{layout}`")
    if optimization_notes_es:
        lines.extend(["", "### Optimizaciones", ""])
        lines.extend(f"- {note}" for note in optimization_notes_es)
    if recommended_theme_id:
        label = theme_label or recommended_theme_id
        lines.extend(["", f"**Tema visual:** {label} (`{recommended_theme_id}`)"])
    lines.extend(["", "### Productos", "", "| Categoría | Producto | Precio |", "| --- | --- | --- |"])
    for category in sorted(draft.categories, key=lambda c: (c.sort_order, c.name)):
        for product in sorted(category.products, key=lambda p: (p.sort_order, p.name)):
            lines.append(
                f"| {category.name} | {product.name} | "
                f"{_format_price_mxn(product.price_mxn, product.currency)} |"
            )
    if draft.promotions:
        lines.extend(["", "### Promociones", ""])
        for promo in draft.promotions:
            lines.append(f"- **{promo.name}** ({promo.type})")
    if draft.open_questions:
        lines.extend(["", "### Pendiente de aclarar", ""])
        for question in draft.open_questions:
            lines.append(f"- [{question.id}] {question.question_es}")
    lines.extend(["", "_Precios en pesos MXN. Al publicar se guardan en centavos._"])
    return "\n".join(lines)
```

- [ ] **Step 4: Run test**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_preview_full.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_import/preview_full.py \
  backend/tests/modules/test_menu_import_preview_full.py
git commit -m "feat(menu_import): add full import executive preview"
```

---

### Task 5: Apply batch — publish products and display_layout

**Files:**
- Modify: `backend/app/modules/assistant/skills/menu_import/apply_batch.py`
- Modify: `backend/tests/modules/test_menu_import_apply.py`

- [ ] **Step 1: Write failing test for published products**

```python
# append to test_menu_import_apply.py (inside existing DB test or new test)
@requires_db
def test_apply_import_batch_publishes_products_and_sets_display_layout(session):
    # reuse _create_restaurant_and_conversation + _sample_batch_payload
    # extend payload category with display_layout: "grid"
    # after apply, MenuService.get_product → is_published True
    # CategoryDTO.display_layout == "grid"
```

Use the existing `_sample_batch_payload` fixture pattern from the file; add `"display_layout": "grid"` to category and assert after apply.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_apply.py::test_apply_import_batch_publishes_products_and_sets_display_layout -v`  
Expected: FAIL — `is_published` False or layout unset

- [ ] **Step 3: Update apply_batch**

```python
# apply_batch.py — imports
from app.modules.menu.schemas import CategoryUpdate, ProductUpdate

# _apply_categories — after create_category:
if category.display_layout in {"vertical", "horizontal", "grid"}:
    menu.update_category(
        ctx.restaurant_id,
        created.id,
        CategoryUpdate(display_layout=category.display_layout),
    )

# _apply_products — after create_product:
menu.update_product(
    ctx.restaurant_id,
    created.id,
    ProductUpdate(is_published=True),
)
# keep existing is_available → is_active=False branch
```

- [ ] **Step 4: Run apply tests**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_apply.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_import/apply_batch.py \
  backend/tests/modules/test_menu_import_apply.py
git commit -m "feat(menu_import): publish products and apply category layout on import"
```

---

### Task 6: apply_full_import

**Files:**
- Modify: `backend/app/modules/assistant/skills/menu_import/apply_batch.py`
- Modify: `backend/tests/modules/test_menu_import_apply.py`

- [ ] **Step 1: Write failing apply_full test**

```python
@requires_db
def test_apply_full_import_applies_all_pending_batches(session):
    # Create session with 2 batches, neither applied
    # apply_full_import(ctx, session, confirmed=True)
    # assert both batches have applied_at
    # assert total products == sum of both batches
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_apply.py::test_apply_full_import_applies_all_pending_batches -v`  
Expected: FAIL — function not defined

- [ ] **Step 3: Implement apply_full_import**

```python
# apply_batch.py
from dataclasses import dataclass
from app.core.config import get_settings
from app.modules.assistant.skills.menu_import.batching import count_batch_products


@dataclass(frozen=True, slots=True)
class ApplyFullResult:
    ok: bool
    summary: str
    batches_applied: int = 0
    categories: int = 0
    products: int = 0
    option_groups: int = 0
    option_items: int = 0
    promotions: int = 0
    created_promotion_ids: list[str] = field(default_factory=list)


def _count_session_products(session: MenuImportSession) -> int:
    total = 0
    for entry in session.draft_batches or []:
        if isinstance(entry, dict):
            total += count_batch_products(ImportBatch.model_validate(entry))
    return total


def apply_full_import(
    ctx: AgentContext,
    session: MenuImportSession,
    *,
    confirmed: bool,
) -> ApplyFullResult:
    if not confirmed:
        return ApplyFullResult(ok=False, summary="confirmed=true is required to apply full import")

    product_total = _count_session_products(session)
    limit = get_settings().menu_import_full_max_products
    if product_total > limit:
        return ApplyFullResult(
            ok=False,
            summary=f"Menu has {product_total} products; full import limit is {limit}",
        )

    batches = list(session.draft_batches or [])
    pending_indexes = [
        index
        for index, entry in enumerate(batches)
        if isinstance(entry, dict) and not entry.get("applied_at")
    ]
    if not pending_indexes:
        return ApplyFullResult(ok=False, summary="No pending batches to apply")

    totals = ApplyFullResult(ok=True, summary="")
    created_promo_ids: list[str] = []
    for batch_index in pending_indexes:
        result = apply_import_batch(ctx, session, batch_index, confirmed=True)
        if not result.ok:
            return ApplyFullResult(ok=False, summary=result.summary)
        totals = ApplyFullResult(
            ok=True,
            summary=totals.summary,
            batches_applied=totals.batches_applied + 1,
            categories=totals.categories + result.categories,
            products=totals.products + result.products,
            option_groups=totals.option_groups + result.option_groups,
            option_items=totals.option_items + result.option_items,
            promotions=totals.promotions + result.promotions,
        )

    summary = (
        f"Applied full import: {totals.batches_applied} batch(es), "
        f"{totals.categories} categories, {totals.products} products, "
        f"{totals.promotions} promotions"
    )
    return ApplyFullResult(
        ok=True,
        summary=summary,
        batches_applied=totals.batches_applied,
        categories=totals.categories,
        products=totals.products,
        option_groups=totals.option_groups,
        option_items=totals.option_items,
        promotions=totals.promotions,
        created_promotion_ids=created_promo_ids,
    )
```

Note: capture `created_promotion_ids` in a follow-up sub-step inside `_apply_promotions` by returning promo UUIDs, or expose via `ref_map` promo refs — extend `_apply_promotions` to return `list[tuple[str, uuid.UUID]]` for NxM banner step in the agent (SKILL instructs agent to `list_promotions` after apply). Keep v1 simple: agent uses `menu_read.list_promotions` post-apply filtered by `type=two_for_one`.

- [ ] **Step 4: Run tests**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_apply.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_import/apply_batch.py \
  backend/tests/modules/test_menu_import_apply.py
git commit -m "feat(menu_import): add apply_full_import for concierge one-shot"
```

---

### Task 7: Wire new tools in MenuImportSkill

**Files:**
- Modify: `backend/app/modules/assistant/skills/menu_import/tools.py`
- Modify: `backend/tests/modules/test_menu_import_tools.py`

- [ ] **Step 1: Update failing tool count test**

```python
# test_menu_import_tools.py
assert len(names) == 16
assert "optimize_import_draft" in names
assert "preview_full_import" in names
assert "apply_full_import" in names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_tools.py::test_menu_import_skill_registered -v`  
Expected: FAIL — len 13 != 16

- [ ] **Step 3: Add tool definitions and handlers**

Add imports:

```python
from app.core.config import get_settings
from app.modules.assistant.skills.menu_import.apply_batch import apply_full_import
from app.modules.assistant.skills.menu_import.draft_merge import merge_draft_batches
from app.modules.assistant.skills.menu_import.optimization import optimize_draft
from app.modules.assistant.skills.menu_import.preview_full import build_full_import_preview
from app.modules.assistant.skills.menu_write.theme_tools import list_menu_themes, recommend_menu_theme
```

Add three `ToolDefinition` entries after `save_clarification_answers`:

```python
ToolDefinition(
    name="optimize_import_draft",
    description=(
        "Merge all extraction batches, optimize order/layout/copy using best practices, "
        "recommend theme, and rewrite draft_batches for full import."
    ),
    effect="mutate",
    input_schema={"type": "object", "properties": {}, "required": []},
),
ToolDefinition(
    name="preview_full_import",
    description="Executive markdown preview of the full optimized menu (prices in MXN).",
    effect="read",
    input_schema={"type": "object", "properties": {}, "required": []},
),
ToolDefinition(
    name="apply_full_import",
    description=(
        "Apply ALL pending import batches in one call. Requires confirmed=true and "
        "no unanswered open_questions."
    ),
    effect="mutate",
    input_schema={
        "type": "object",
        "properties": {"confirmed": {"type": "boolean", "default": False}},
        "required": [],
    },
),
```

Handler `optimize_import_draft`:

```python
if tool_name == "optimize_import_draft":
    batches = [ImportBatch.model_validate(b) for b in _batch_entries(session)]
    if not batches:
        return ToolResult(ok=False, summary="Run extraction before optimizing")
    merged = merge_draft_batches(batches)
    opt = optimize_draft(merged, _extraction_context(session))
    theme_id = opt.recommended_theme_id
    if not theme_id:
        recs = recommend_menu_theme(ctx, session=session)
        if recs:
            theme_id = recs[0].theme_id
    if theme_id:
        session.selected_theme_id = theme_id
    discovery = dict(session.discovery_answers or {})
    discovery["concierge_mode"] = True
    discovery["optimization_notes_es"] = opt.optimization_notes_es
    session.discovery_answers = discovery
    optimized_batches = split_draft_into_batches(opt.draft)
    session.draft_batches = [b.model_dump() for b in optimized_batches]
    session.status = MenuImportSessionStatus.PREVIEW_BATCH.value
    _repo(ctx).update(session)
    return ToolResult(
        ok=True,
        summary="Optimized import draft for full preview",
        data={
            "optimization_notes_es": opt.optimization_notes_es,
            "recommended_theme_id": theme_id,
            "product_count": sum(count_batch_products(b) for b in optimized_batches),
            **_session_summary(session),
        },
    )
```

Handler `preview_full_import`:

```python
if tool_name == "preview_full_import":
    merged = merge_draft_batches([ImportBatch.model_validate(b) for b in _batch_entries(session)])
    discovery = session.discovery_answers or {}
    notes = discovery.get("optimization_notes_es") or []
    theme_id = session.selected_theme_id
    theme_label = theme_id
    if theme_id:
        themes = {t["id"]: t.get("label", t["id"]) for t in list_menu_themes(ctx)}
        theme_label = themes.get(theme_id, theme_id)
    markdown = build_full_import_preview(
        merged,
        optimization_notes_es=notes if isinstance(notes, list) else [],
        recommended_theme_id=theme_id,
        theme_label=theme_label,
    )
    return ToolResult(
        ok=True,
        summary="Full import preview ready",
        data={"markdown": markdown, "open_questions": [q.model_dump() for q in merged.open_questions]},
    )
```

Handler `apply_full_import`:

```python
if tool_name == "apply_full_import":
    confirmed = bool(args.get("confirmed", False))
    result = apply_full_import(ctx, session, confirmed=confirmed)
    if result.ok:
        session.status = MenuImportSessionStatus.MATCHING_IMAGES.value
        _repo(ctx).update(session)
    return ToolResult(ok=result.ok, summary=result.summary, data={**result.__dict__, **_session_summary(session)})
```

Fix `save_clarification_answers` status when all answered:

```python
# replace COLLECTING_IMAGES with:
session.status = MenuImportSessionStatus.OPTIMIZING.value
```

Update `start_menu_import_session` welcome data hint:

```python
discovery_answers={"concierge_mode": True}
```

on create (optional default in repo.create or first save).

- [ ] **Step 4: Run tool tests**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_tools.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_import/tools.py \
  backend/tests/modules/test_menu_import_tools.py
git commit -m "feat(menu_import): wire concierge optimize/preview/apply_full tools"
```

---

### Task 8: Rewrite SKILL.md and promotions note

**Files:**
- Modify: `backend/app/modules/assistant/skills/menu_import/SKILL.md`
- Modify: `backend/app/modules/assistant/skills/promotions/SKILL.md`
- Create: `backend/tests/modules/test_menu_import_skill_md.py`

- [ ] **Step 1: Write failing SKILL test**

```python
# backend/tests/modules/test_menu_import_skill_md.py
from pathlib import Path


def test_menu_import_skill_md_concierge_workflow():
    text = Path("app/modules/assistant/skills/menu_import/SKILL.md").read_text()
    assert "load_skill(menu_write)" in text
    assert "load_skill(menu_best_practices)" in text
    assert "optimize_import_draft" in text
    assert "preview_full_import" in text
    assert "apply_full_import" in text
    assert "Never during import" in text
    assert "generate_product_image" in text
    assert "request_image_enhancement" not in text.split("## Workflow")[1].split("## Tools")[0]


def test_menu_import_skill_md_no_menu_media_in_workflow():
    text = Path("app/modules/assistant/skills/menu_import/SKILL.md").read_text()
    workflow = text.split("## Workflow")[1].split("## Tools")[0]
    assert "menu_media" not in workflow
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_skill_md.py -v`  
Expected: FAIL

- [ ] **Step 3: Rewrite SKILL.md**

Replace workflow section with concierge sequence from spec §3:

1. `load_skill(menu_write)` + `load_skill(menu_best_practices)` + `start_menu_import_session`
2. Register sources → extract → clarify (1 question/turn)
3. `optimize_import_draft` → `preview_full_import` → owner confirms once
4. `apply_full_import(confirmed=true)` → `apply_menu_theme` → `load_skill(promotions)` → `generate_promotion_banner` for each `two_for_one`
5. Ask for photos → `match_product_photos` → `bulk_assign_product_images`
6. `update_menu_knowledge`

Add **Never during import** block listing `menu_media`, `generate_product_image`, `request_image_enhancement`.

Remove steps 7–10 old batch loop and `request_image_enhancement` from workflow.

Add **Always after apply for NxM** block.

- [ ] **Step 4: Add promotions SKILL note**

Append to `promotions/SKILL.md` under a `## During menu_import concierge` section:

```markdown
## During menu_import concierge

When the owner is in an active `menu_import` session and `apply_full_import` just completed,
**auto-generate banners** for every live promo with `type: two_for_one` using
`generate_promotion_banner` (`confirmed: true`) — do not ask unless banner generation fails.
Do not generate product food photos during import.
```

- [ ] **Step 5: Run SKILL tests**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_skill_md.py -v`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_import/SKILL.md \
  backend/app/modules/assistant/skills/promotions/SKILL.md \
  backend/tests/modules/test_menu_import_skill_md.py
git commit -m "docs(menu_import): concierge workflow in SKILL.md"
```

---

### Task 9: Update E2E stub and extraction prompt (optional fields)

**Files:**
- Modify: `backend/tests/modules/test_menu_import_e2e_stub.py`
- Modify: `backend/app/modules/assistant/skills/menu_import/extraction_prompt.py`

- [ ] **Step 1: Extend extraction prompt schema hint**

Add to JSON shape in `extraction_prompt.py` for categories:

```text
"display_layout": "vertical | horizontal | grid | null"  (optional, usually null at extract)
```

Add `"sort_order": 0` on products (optional).

- [ ] **Step 2: Update e2e stub to concierge path**

Replace per-batch apply loop with:

```python
skill.execute("optimize_import_draft", {}, ctx)
skill.execute("preview_full_import", {}, ctx)
skill.execute("apply_full_import", {"confirmed": True}, ctx)
```

- [ ] **Step 3: Run full menu_import test suite**

Run: `cd backend && .venv/bin/pytest tests/modules/test_menu_import_*.py -v`  
Expected: all PASS (DB tests skip without Postgres)

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/assistant/skills/menu_import/extraction_prompt.py \
  backend/tests/modules/test_menu_import_e2e_stub.py
git commit -m "test(menu_import): update e2e stub for concierge flow"
```

---

### Task 10: Update spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-07-06-menu-import-concierge-redesign.es.md`

- [ ] **Step 1: Set spec estado to implemented-ready**

Change line 4 from `pendiente revisión del spec escrito` to `Plan de implementación en docs/superpowers/plans/2026-07-06-menu-import-concierge-redesign.md`.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-06-menu-import-concierge-redesign.es.md \
  docs/superpowers/plans/2026-07-06-menu-import-concierge-redesign.md
git commit -m "docs: menu import concierge spec + implementation plan"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Concierge one-shot preview + apply | Tasks 4, 6, 7, 8 |
| optimize_import_draft | Tasks 1, 3, 7 |
| preview_full_import | Tasks 4, 7 |
| apply_full_import (200 limit) | Tasks 1, 6, 7 |
| menu_write + menu_best_practices at start | Task 8 |
| No menu_media / product AI | Task 8 |
| NxM banners post-apply | Task 8 (promotions SKILL) |
| Photos after apply via menu_write | Task 8 (SKILL) |
| is_published + display_layout | Task 5 |
| Tests | Tasks 1–9 |

No placeholders. Types consistent: `OptimizationResult`, `ApplyFullResult`, `ImportCategory.display_layout`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-menu-import-concierge-redesign.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you want?

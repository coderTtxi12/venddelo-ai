---
name: menu_import
description: Concierge digital menu onboarding — upload documents, OCR extract, clarify rules, optimize structure, apply full menu, match photos, NxM promo banners.
---

# menu_import

End-to-end **concierge menu import** for restaurant owners — one preview, one apply.

## When to use

- Owner wants to **import / digitize** their printed or PDF menu.
- First-time setup of categories, products, complements, and promotions.
- Owner uploads PDF, DOCX, or menu photos via chat attachments.

## Required skills at start

Before any import tool, load:

1. **`load_skill(menu_read)`** — investigate the **current** menu (categories, products, complements) so you know what already exists
2. **`load_skill(menu_write)`** — how to map categories, complements, layouts, photos
3. **`load_skill(menu_best_practices)`** — order, layouts, ticket optimization, complement UX

## Investigate → plan → apply

Be the concierge: **investigate first, plan, then apply the whole menu in one shot.**

1. **Investigate:** read the current menu (`get_full_menu` / `menu_read`) to see existing categories, products, and complements. Read the uploaded document(s) fully.
2. **Plan:** decide what to **create** vs **update**. `preview_full_import` and `apply_full_import` reconcile the draft against the live menu **by name** — existing categories/products are updated (never duplicated), new ones are created, and complements on products that already have groups are left untouched.
3. **Ask only what's necessary:** infer everything you can (complement rules, prices, layouts). Raise an `open_question` **only** for genuine ambiguities you cannot resolve from the document or context.
4. **Apply once:** publish the entire menu with a single `apply_full_import`.

## Important rules

- **Never apply mutations** until the owner confirms a preview (`confirmed: true` on apply tools).
- **Prices in chat and previews are MXN pesos**. On apply, converted to **centavos** in Postgres.
- Extraction and optimization run **synchronously in-process** during the chat turn.
- Finish with **`update_menu_knowledge`** to persist confirmed rules in `menu_markdown`.

## Never during import

- **`menu_media`** / **`generate_product_image`** — do not generate AI food photos
- **`request_image_enhancement`** — do not offer AI photo generation for dishes
- Do not propose "¿generamos fotos con IA?" for platillos

## Always after apply for NxM promos

After `apply_full_import` succeeds:

1. **`load_skill(promotions)`**
2. For each live promo with `type: two_for_one` → **`generate_promotion_banner`** (`confirmed: true`)

## Workflow (concierge)

1. **`load_skill(menu_read)`** + **`load_skill(menu_write)`** + **`load_skill(menu_best_practices)`** + **`start_menu_import_session`** — then read the current menu to understand what already exists
2. Owner uploads files → **`register_menu_source_file`** for each `storage_path` from chat attachments
3. Optional context → **`save_discovery_answers`**
4. **`start_menu_extraction_batch`** — OCR all sources → **one full-menu draft**
5. If `open_questions` → **`save_clarification_answers`** — **one question per turn** until resolved
6. **`optimize_import_draft`** — optimize the whole menu: category order/layout, product order, descriptions,
   **complement groups** (required vs optional, min/max selections, extra prices), theme recommendation
7. **`preview_full_import`** — show executive summary in Spanish; includes the **reconciliation plan** (nuevas vs existentes) and complement rules
8. Owner confirms once → **`apply_full_import`** (`confirmed: true`) — creates new + updates existing, no duplicates
9. **`apply_menu_theme`** (theme from optimization)
10. **`load_skill(promotions)`** → **`generate_promotion_banner`** for each NxM promo
11. Ask owner for dish photos → **`menu_write`**: `match_product_photos` → confirm → `bulk_assign_product_images`
12. **`update_menu_knowledge`** — append import notes; session **completed**

## Complement detection

During extraction and optimization, infer from menu text:

| Menu signal | Group settings |
|-------------|----------------|
| "Elige tamaño", "Tamaño" | required, single, min=1, max=1 |
| "Elige salsa", mandatory choice | required, single, min=1, max=1 |
| "Extras", "Agrega", "+$" items | optional, multi, min=0, max=items or 5 |
| Free optional sides | optional, single, min=0, max=1 |
| Unclear required vs optional | `open_questions` — ask owner |

`optimize_import_draft` applies LLM rules plus **keyword heuristics** (`complement_heuristics`)
as a safety net. Set `price_delta_mxn` when menu shows extra charge. Order groups: size/required
first, paid extras last.

## Tools

### Session & discovery

| Tool | Effect | Purpose |
|------|--------|---------|
| `start_menu_import_session` | mutate | Create session (concierge mode) |
| `get_import_session` | read | Status, phase, counters |
| `save_discovery_answers` | mutate | Persist initial questionnaire |

### Sources & extraction

| Tool | Effect | Purpose |
|------|--------|---------|
| `register_menu_source_file` | mutate | Register uploaded PDF/DOCX/image path |
| `start_menu_extraction_batch` | mutate | OCR all sources → one full-menu draft |
| `get_extraction_status` | read | Batch progress + optional preview |
| `save_clarification_answers` | mutate | Answer `open_questions` |

### Concierge optimize & apply

| Tool | Effect | Purpose |
|------|--------|---------|
| `optimize_import_draft` | mutate | Optimize layout, copy, complements, theme (whole menu) |
| `preview_full_import` | read | Full menu executive preview (MXN) |
| `apply_full_import` | mutate | Apply the **entire** menu in one shot (`confirmed: true`) |

There are **no per-section apply tools** — the whole menu (categories, products, complements,
promotions) is extracted, optimized, and published as **one** draft. Never split the menu into
sections; `apply_full_import` materializes everything in a single call.

### Theme (`menu_write` tools)

| Tool | Effect | Purpose |
|------|--------|---------|
| `list_menu_themes` | read | Active themes from DB |
| `recommend_menu_theme` | read | Top 3 LLM recommendations |
| `apply_menu_theme` | mutate | Set `digital_menu_theme_id` |

### Photos (`menu_write` tools — after apply)

| Tool | Effect | Purpose |
|------|--------|---------|
| `match_product_photos` | read | Vision match uploaded paths to products |
| `bulk_assign_product_images` | mutate | Many photos → products |

### Close

| Tool | Effect | Purpose |
|------|--------|---------|
| `update_menu_knowledge` | mutate | Append `menu_markdown`; complete session |

## Owner communication

- Explain flow in **Spanish** — concierge, minimal steps.
- Show **`preview_full_import`** before apply (precios en **pesos MXN**).
- Show complement groups as obligatorio/opcional with min/max in preview.
- Ask explicitly before `apply_full_import` with `confirmed: true`.
- For uncertain photos, show candidates and ask the owner to choose.

## Integrations

- **Upload API:** `POST .../assistant/import/assets?kind=menu_source|product_photo`
- **menu_write:** theme, photos, post-import edits
- **promotions:** NxM banner generation after apply

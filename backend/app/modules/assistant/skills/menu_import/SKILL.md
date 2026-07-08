---
name: menu_import
description: Concierge digital menu onboarding — upload documents, OCR extract, clarify rules, apply full menu as-is, NxM promo banners.
---

# menu_import

End-to-end **concierge menu import** for restaurant owners — one preview, one apply.

## When to use

- Owner wants to **import / digitize** their printed or PDF menu.
- First-time setup of categories, products, complements, and promotions.
- Owner uploads PDF, DOCX, or menu photos via chat attachments (`menu_source` only).

## Main workflow entry (agent-as-tool)

The **main assistant executor** calls a single tool:

- **`run_menu_import_onboarding`** — sub-agent with all internal `menu_import` tools, Postgres
  session memory (`live_menu_snapshot`, `reconciliation_snapshot`), batch questions, and
  one-shot `apply_full_import`.

Granular `menu_import` tools are **internal** to that sub-agent, not exposed on the main executor.

## Required skills at start

Before any import tool, load:

1. **`load_skill(menu_read)`** — investigate the **current** menu (categories, products, complements) so you know what already exists
2. **`load_skill(menu_write)`** — how to map categories, complements, layouts (not product photos)

## Investigate → plan → apply

Be the concierge: **investigate first, plan, then apply the whole menu in one shot.**

1. **Investigate:** `analyze_import_vs_live` caches the live menu snapshot in Postgres and reconciles the OCR draft — do not re-scan the live menu every turn.
2. **Plan:** decide what to **create** vs **update**. `preview_full_import` and `apply_full_import` reconcile the draft against the live menu **by name** — existing categories/products are updated (never duplicated), new ones are created, and complements on products that already have groups are left untouched unless the owner clarifies.
3. **Ask only what's necessary:** infer everything you can (complement rules, prices, layouts). Raise an `open_question` **only** for genuine ambiguities you cannot resolve from the document or context.
4. **Ask in one batch:** when there are `open_questions`, return them in the structured JSON field `questions` (2–4 short `suggested_answers` per item, `allow_other: true`). Do not embed questions in `message`.
5. **Apply as-is:** publish menu copy exactly as extracted (plus owner clarification answers).
   Layout (`vertical` / `grid` / `horizontal`) and sort order are applied automatically at
   preview/apply to improve average ticket and sales.
6. **Apply once:** publish the entire menu with a single `apply_full_import`.

## Important rules

- **Never apply mutations** until the owner confirms a preview (`confirmed: true` on apply tools).
- **Prices in chat and previews are MXN pesos**. On apply, converted to **centavos** in Postgres.
- Extraction runs **synchronously in-process** during the chat turn.
- Finish with **`update_menu_knowledge`** to persist confirmed rules in `menu_markdown`.

## Never during import

- **`menu_media`** / **`generate_product_image`** — do not generate AI food photos
- **`request_image_enhancement`** — do not offer AI photo generation for dishes
- **`match_product_photos`** / **`bulk_assign_product_images`** — do not match or assign dish photos
- Do not ask the owner to upload product photos or assign images to products
- Do not optimize layout/copy or enhance descriptions with LLM
- Layout and ordering are applied automatically at preview/apply (see **Merchandising** below)

## Always after apply for NxM promos

After `apply_full_import` succeeds:

1. **`load_skill(promotions)`**
2. For each live promo with `type: two_for_one` → **`generate_promotion_banner`** (`confirmed: true`)

## Workflow (concierge)

1. **`run_menu_import_onboarding`** (main executor) or internal sub-flow:
   - **`start_menu_import_session`** — concierge mode; session persists in Postgres
2. Owner uploads files → **`register_menu_source_file`** for each `storage_path` from chat attachments
3. Optional context → **`save_discovery_answers`**
4. **`start_menu_extraction_batch`** — OCR all sources → **one full-menu draft**
5. **`analyze_import_vs_live`** — cache live menu + reconciliation; merge complement questions
6. If `open_questions` → ask **all questions in one message** → **`save_clarification_answers`** with every answer at once
7. **`preview_full_import`** — show executive summary in Spanish (as extracted); includes the **reconciliation plan** (nuevas vs existentes) and complement rules
8. Owner confirms once → **`apply_full_import`** (`confirmed: true`) — creates new + updates existing, no duplicates
9. **`load_skill(promotions)`** → **`generate_promotion_banner`** for each NxM promo (if any)
10. **`update_menu_knowledge`** — append import notes; session **completed**

## Complement detection

During extraction, infer from menu text:

| Menu signal | Group settings |
|-------------|----------------|
| "Elige tamaño", "Tamaño" | required, single, min=1, max=1 |
| "Elige salsa", mandatory choice | required, single, min=1, max=1 |
| "Extras", "Agrega", "+$" items | optional, multi, min=0, max=items or 5 |
| Free optional sides | optional, single, min=0, max=1 |
| Unclear required vs optional | `open_questions` — ask owner |

Set `price_delta_mxn` when menu shows extra charge.

## Merchandising (automatic at preview / apply)

Without rewriting copy, the import pipeline sets:

| Decision | Rule |
|----------|------|
| `display_layout` (new categories only) | `vertical` — many items (default); `grid` — few items or drinks/desserts; `horizontal` — promos/combos/popular carousels |
| Category order | Promos/combos → mains → sides → desserts → drinks (ticket-focused) |
| Product order | Promos/combos first, then premium price anchoring (higher price earlier) |
| Complement group order | Required (size/drink) → optional → paid extras last (upsell) |
| Complement item order | Premium/large sizes first; paid extras by higher `price_delta_mxn` first |

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
| `analyze_import_vs_live` | mutate | Cache live menu snapshot + reconciliation; complement questions |
| `save_clarification_answers` | mutate | Answer all `open_questions` in one call |

### Preview & apply

| Tool | Effect | Purpose |
|------|--------|---------|
| `preview_full_import` | read | Full menu executive preview as extracted (MXN) |
| `apply_full_import` | mutate | Apply the **entire** menu in one shot (`confirmed: true`) |

There are **no per-section apply tools** — the whole menu (categories, products, complements,
promotions) is extracted and published as **one** draft. Never split the menu into
sections; `apply_full_import` materializes everything in a single call.

### Close

| Tool | Effect | Purpose |
|------|--------|---------|
| `update_menu_knowledge` | mutate | Append `menu_markdown`; complete session |

## Owner communication

- Explain flow in **Spanish** — concierge, minimal steps.
- Show **`preview_full_import`** before apply (precios en **pesos MXN**).
- Show complement groups as obligatorio/opcional with min/max in preview.
- Ask explicitly before `apply_full_import` with `confirmed: true`.

## Integrations

- **Upload API:** `POST .../assistant/import/assets?kind=menu_source`
- **menu_write:** post-import edits (not photos during import)
- **promotions:** NxM banner generation after apply

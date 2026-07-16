---
name: menu_import
description: Digital menu onboarding — upload documents, optional owner context, OCR extract, auto-apply full menu, NxM promo banners.
---

# menu_import

End-to-end **menu import** for restaurant owners — OCR and publish in one step.

## When to use

- Owner wants to **import / digitize** their printed or PDF menu.
- First-time setup of categories, products, complements, and promotions.
- Owner uploads PDF, DOCX, or menu photos via chat attachments (`menu_source` only).

## Main workflow entry (agent-as-tool)

The **main assistant executor** calls a single tool:

- **`run_menu_import_onboarding`** — sub-agent pair: **MenuImportExecutor** (tools) +
  **MenuImportResponder** (owner-facing JSON), Postgres session memory.

Granular `menu_import` tools are **internal** to that sub-agent, not exposed on the main executor.

## Required skills at start

Before any import tool, load:

1. **`load_skill(menu_read)`** — investigate the **current** menu (categories, products, complements)
2. **`load_skill(menu_write)`** — how to map categories, complements, layouts (not product photos)

## Plan → apply

Direct flow: **optional owner context → OCR → auto-apply entire menu.**

1. **Context (optional):** owner notes on structure, groupings, variant rules — `save_menu_context` **before** OCR.
2. **Extract (2 phases):** literal OCR → `ocr_original` (immutable); modeling pass applies owner context → `draft_batches`.
3. **Apply:** `start_menu_extraction_batch` publishes the modeled draft to the live menu.

## Important rules

- **Prices in chat are MXN pesos**. On apply, converted to **centavos** in Postgres.
- Extraction runs **synchronously in-process** during the chat turn.
- Finish with **`update_menu_knowledge`** to persist notes and complete the session.
- Do **not** ask clarification quizzes or run LLM optimization/description passes during import.

## Never during import

- **`menu_media`** / product photo tools
- Do not ask the owner to upload product photos
- Do not call **`load_skill(menu_best_practices)`** during import

## Always after apply for NxM promos

After import succeeds:

1. **`load_skill(promotions)`**
2. For each live promo with `type: two_for_one` → **`generate_promotion_banner`** (`confirmed: true`)

## Workflow

1. **`start_menu_import_session`**
2. Optional → **`save_menu_context`** (owner description before OCR)
3. **`register_menu_source_file`** for each attachment
4. **`start_menu_extraction_batch`** — OCR + **`apply_full_import`** in one step
5. **`load_skill(promotions)`** → banners for NxM promos (if any)
6. **`update_menu_knowledge`** — session **completed**

## Storage

| Column | Purpose |
|--------|---------|
| `ocr_original` | Immutable literal OCR snapshot |
| `draft_batches` | Modeled working copy (owner context applied); applied to live menu |
| `discovery_answers.menu_context` | Owner notes injected into OCR prompt |

## Tools

| Tool | Effect | Purpose |
|------|--------|---------|
| `start_menu_import_session` | mutate | Create session |
| `get_import_session` | read | Status and counters |
| `save_menu_context` | mutate | Owner notes before OCR |
| `register_menu_source_file` | mutate | Register uploaded file path |
| `start_menu_extraction_batch` | mutate | OCR → persist snapshots → apply live menu |
| `get_extraction_status` | read | Progress + optional preview |
| `apply_full_import` | mutate | Re-apply an existing unapplied draft (manual fallback) |
| `update_menu_knowledge` | mutate | Complete session |

## Owner communication

- Explain flow in **Spanish** — minimal steps.
- After import, share **`public_menu_url`** and product/category counts.
- Precios en **pesos MXN**.

## Integrations

- **Upload API:** `POST .../assistant/import/assets` (no `kind`; PDF/DOCX → inbox as-is; images → WebP in inbox)
- **menu_write:** post-import edits
- **promotions:** NxM banner generation after apply

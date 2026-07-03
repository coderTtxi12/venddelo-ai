---
name: menu_import
description: Full digital menu onboarding — upload documents, OCR extract, clarify rules, collect photos, apply batches, map images, and enrich copy.
---

# menu_import

End-to-end **menu import onboarding** for restaurant owners.

## When to use

- Owner wants to **import / digitize** their printed or PDF menu.
- First-time setup of categories, products, complements, and promotions.
- Owner uploads PDF, DOCX, or menu photos via chat attachments.

## Important rules

- **Never apply mutations** until the owner confirms a preview (`confirmed: true` on apply tools).
- Extraction, apply, and photo match run **synchronously in-process** during the chat turn.
- Use **`menu_media`** for AI image generation after `request_image_enhancement`.
- Finish with **`update_menu_knowledge`** to persist confirmed rules in `menu_markdown`.

## Workflow (phases)

1. **`start_menu_import_session`** — welcome; explain steps in Spanish.
2. **`save_discovery_answers`** — cuisine type, currency, promo context.
3. Owner uploads files → **`register_menu_source_file`** for each path from the upload API.
4. **`start_menu_extraction_batch`** — OCR/vision extraction → `draft_batches[]`.
5. If `open_questions` → **`save_clarification_answers`** until resolved.
6. Owner uploads dish photos → **`register_product_image`** for each.
7. **`list_menu_themes`** + **`recommend_menu_theme`** → owner picks → **`apply_menu_theme`**.
8. For each batch: **`preview_import_batch`** → owner confirms → **`apply_menu_batch`** (`confirmed: true`).
9. **`match_photos_to_products`** → resolve **`uncertain_images`** with **`resolve_uncertain_image`**.
10. **`apply_photo_mappings`** (`confirmed: true`).
11. Optional: **`preview_description_enhancements`** → **`apply_description_enhancements`**.
12. Optional: **`request_image_enhancement`** → **`menu_media`** `generate_product_image` / `bulk_generate_product_images`.
13. **`update_menu_knowledge`** — append import notes; marks session **completed**.

## Tools

### Session & discovery

| Tool | Effect | Purpose |
|------|--------|---------|
| `start_menu_import_session` | mutate | Create session (cancel previous with `confirm_cancel_previous`) |
| `get_import_session` | read | Status, phase, counters |
| `save_discovery_answers` | mutate | Persist initial questionnaire |

### Sources & extraction

| Tool | Effect | Purpose |
|------|--------|---------|
| `register_menu_source_file` | mutate | Register uploaded PDF/DOCX/image path |
| `start_menu_extraction_batch` | mutate | OCR all sources → split into batches (≤15 products) |
| `get_extraction_status` | read | Batch progress + optional preview |
| `save_clarification_answers` | mutate | Answer `open_questions` |

### Theme

| Tool | Effect | Purpose |
|------|--------|---------|
| `list_menu_themes` | read | Active themes from DB |
| `recommend_menu_theme` | read | Top 3 LLM recommendations |
| `apply_menu_theme` | mutate | Set `digital_menu_theme_id` |

### Photos

| Tool | Effect | Purpose |
|------|--------|---------|
| `register_product_image` | mutate | Register uploaded product photo |
| `match_photos_to_products` | read | Vision match → matched / uncertain / unmatched |
| `resolve_uncertain_image` | mutate | Owner assigns `product_ref` manually |
| `apply_photo_mappings` | mutate | Set `image_path` on products (`confirmed: true`) |

### Apply menu

| Tool | Effect | Purpose |
|------|--------|---------|
| `preview_import_batch` | read | Markdown table for owner review |
| `apply_menu_batch` | mutate | Create categories/products/promos (`confirmed: true`) |

### Enrichment

| Tool | Effect | Purpose |
|------|--------|---------|
| `preview_description_enhancements` | read | LLM copy proposals |
| `apply_description_enhancements` | mutate | Bulk apply descriptions |
| `request_image_enhancement` | read | List products without images for `menu_media` |
| `update_menu_knowledge` | mutate | Append `menu_markdown` notes; complete session |

## Owner communication

- Explain each phase in **Spanish** before calling tools.
- Show **`preview_import_batch`** markdown tables before apply.
- Ask explicitly before any `confirmed: true` mutation.
- For uncertain photos, show candidates and ask the owner to choose.

## Integrations

- **Upload API:** `POST .../assistant/import/assets?kind=menu_source|product_photo`
- **menu_media:** image generation after `request_image_enhancement`
- **menu_read / menu_write:** post-import edits use those skills

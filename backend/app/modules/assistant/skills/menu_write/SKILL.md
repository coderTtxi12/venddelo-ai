---
name: menu_write
description: Create and update menu categories, products, options, and availability (mutations require confirmation).
---

# menu_write

Mutating access to the current restaurant menu. All writes are tenant-scoped. **Never delete**
records — disable with `is_active=false` on `update_category`, `update_product`,
`update_option_group`, or `update_option_item`.

---

## When to use this skill

Use `menu_write` when the owner asks to **change** the menu:

- Add or rename categories or products
- Update prices, descriptions, or availability flags
- Reorder items within a category
- Attach option groups or adjust add-on prices

Use `menu_read` first when you need live data before proposing a change.

For **improve / optimize / recommend / audit** requests (not just a single confirmed write),
call **`load_skill(menu_best_practices)`** before `menu_read` so proposals follow quality
criteria, then read the live menu before previewing or mutating.

---

## Safety rules

1. **Read before write** — inspect the current record with `menu_read` when IDs or names are unclear.
2. **Preview** — describe exactly what will change (before/after) before calling a mutate tool.
3. **Confirm** — wait for explicit owner approval on bulk or high-impact edits.
4. **Never delete** — use `is_active=false` only (no delete tools exist).
5. **Bulk edits** — for many products (descriptions, prices, names), use the matching
   `bulk_update_product_*` tool after owner confirmation; do not loop `update_product`.
6. **Resolve by exact name** — when the owner confirms a product (e.g. "este HAMBURGUESA"),
   pass that name to `update_product` or bulk tools; never reuse a `product_id` from an
   earlier ambiguous candidate list.

---

## Available tools

| Tool | Purpose |
|------|---------|
| `create_category` | New category (`name`, optional `description`, `sort_index`) |
| `update_category` | Rename, reorder, or disable a category (`category_id` + fields) |
| `create_product` | New product (`name`, `price_cents`, `category_ids`, optional `description`, `is_published`) |
| `update_product` | Change one product by `product_id` **or** `name`/`product_name`; use `new_name` to rename; `price_cents` in cents (100 MXN = 10000) |
| `bulk_update_product_names` | Rename up to 50 products (`items[]` with `new_name` + `product_id` or lookup name) |
| `bulk_update_product_descriptions` | Rewrite up to 50 descriptions in one call (`items[]` with `description` + `product_id` or `name`) |
| `bulk_update_product_prices` | Change up to 50 prices in one call (`items[]` with `price_cents` + `product_id` or `name`) |
| `set_category_product_order` | Reorder products in one category (`category_id`, full `product_ids` list) |
| `add_option_group` | Add size/extras group to a product |
| `update_option_group` | Change group rules or disable with `is_active=false` |
| `add_option_item` | Add one add-on choice to a group |
| `update_option_item` | Change label/price or disable with `is_active=false` |

Prices are always in **cents** (e.g. $24.40 → `2440`).

---

## Typical flow

```
Owner request (change or improve menu)
  → load_skill(menu_best_practices)   ← required for improve/optimize/recommend/audit
  → load_skill(menu_write)            ← optional; only if you need this mutate guide
  → menu_read tools to fetch current state
  → Plain-language preview for the owner
  → Owner confirms
  → menu_write mutate tool(s)
  → Answer summarizing what changed (owner-facing Markdown, no raw JSON keys)
```

---

## Reply style after a write

- Confirm what changed in plain Spanish for the restaurant owner.
- Mention product/category names, not UUIDs, unless the owner asked for IDs.
- If a tool fails, explain in plain language and suggest a read-only check with `menu_read`.

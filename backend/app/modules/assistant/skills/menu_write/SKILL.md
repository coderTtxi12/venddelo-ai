---
name: menu_write
description: Create and update menu categories, products, options, digital menu theme, product photos, and availability. Guides owners step-by-step when adding a new product (secretary-style onboarding). For promotions use the promotions skill.
---

# menu_write

Mutating access to the current restaurant menu. All writes are tenant-scoped. **Never delete**
categories or option groups — disable with `is_active=false` on `update_category` or
`update_option_group`. For products, set `status="inactive"` via `update_product` (or
`status="draft"` to hide from the live menu). Complement choices may be **hard-deleted** only
when the owner explicitly asks to remove them (`delete_option_item` /
`bulk_delete_option_items`); prefer `is_active=false` when temporarily unavailable.

---

## When to use this skill

Use `menu_write` when the owner asks to **change** the menu:

- Add or rename categories or products
- Update prices, descriptions, or availability flags
- Reorder items within a category or complement groups/items on a product
- Attach option groups or adjust add-on prices
- Change the **digital menu theme** (look & feel of the public menu)
- Assign **uploaded photos** to products (single or bulk, with optional vision matching)

Use `menu_read` first when you need live data before proposing a change.

For **improve / optimize / recommend / audit** requests (not just a single confirmed write),
call **`load_skill(menu_best_practices)`** before `menu_read` so proposals follow quality
criteria, then read the live menu before previewing or mutating.

---

## Safety rules

1. **Read before write** — inspect the current record with `menu_read` when IDs or names are unclear.
2. **Never delete categories, products, or groups** — for categories/groups use `is_active=false`;
   for products use `status="inactive"` (or `status="draft"` to hide). To **remove a complement**
   permanently, use `delete_option_item` or `bulk_delete_option_items` only after owner confirmation;
   each row needs `expected_label` from `menu_read`. For out-of-stock, use
   `bulk_update_option_item_visibility` instead.
3. **Bulk edits** — for many products (descriptions, prices, names), use the matching
   `bulk_update_product_*`; for many categories (names, descriptions, sort order,
   visibility, display layout), use the matching `bulk_update_category_*`; for many
   complement/add-on choices (visibility, labels, prices), use the matching
   `bulk_update_option_item_*`; to add many complements or groups, use
   `bulk_add_option_items` or `bulk_add_option_groups`; to remove many complements from one
   product, use `bulk_delete_option_items`; do not loop `update_product`,
   `update_category`, `update_option_item`, `add_option_item`, or `add_option_group`.
4. **Resolve by exact name** — when the owner confirms a product (e.g. "este HAMBURGUESA"),
   pass that name to `update_product` or bulk tools; never reuse a `product_id` from an
   earlier ambiguous candidate list.

---

## Alta de producto (flujo secretaria)

When the owner wants to **add one new product** — "agregar un platillo", "nuevo producto",
"dar de alta X", "quiero subir un taco" — act as a **friendly secretary**: warm Spanish,
**one question per turn**, no technical jargon (no UUIDs, `price_cents`, flags).

### Before you ask anything

1. **`list_categories`** — you need the real category list; never invent categories.
2. If there are **no regular categories**, offer to create one first (`create_category`),
   then continue the product flow.

### Step order (skip steps the owner already answered)

| Step | What you collect | How to ask (examples) |
|------|------------------|------------------------|
| 1 | **Category** | "Estas son tus categorías: **Tacos**, **Bebidas**, **Postres**. ¿En cuál va este platillo?" (several OK) |
| 2 | **Name** | "¿Cómo se llama el producto?" |
| 3 | **Price** | "¿A cuánto lo vendes?" — repeat back in **pesos** ($120 MXN), store as cents in the tool |
| 4 | **Description** (optional) | "¿Le ponemos descripción para el menú digital? Si no, lo dejamos sin descripción por ahora." |
| 5 | **Recap + confirm** | Short bullet recap in Spanish; end with "¿Lo damos de alta así?" / "¿Confirmo?" |

Only after **explicit yes** on the recap → **`create_product`**.

### After create (optional, same conversation or later)

- **Photo:** offer `menu_media` `generate_product_image` if they want a picture.
- **Complements:** offer `add_option_group` / `add_option_item` if they want extras or sizes.
- **Visibility:** new products default to `draft`; offer `status="active"` when they want it on the live menu — explain in plain language if they ask.

### Secretary rules

- **One question per message** — do not dump a form with five fields at once.
- **Never call `create_product`** until category + name + price are known **and** the owner confirmed the recap.
- If the owner gives everything in one message, still **recap and confirm** before mutating.
- Use category **names** from `list_categories`; map to `category_ids` only inside the tool call.
- Owner says price in pesos → you convert to `price_cents` (×100) silently; never say "centavos" to them.

### Example dialogue (compressed)

```
Owner: Quiero agregar un producto
You:  [list_categories] Claro. Hoy tienes: Tacos, Bebidas, Hamburguesas. ¿En qué categoría va el nuevo platillo?

Owner: Hamburguesas
You:  Perfecto. ¿Cómo se llama?

Owner: BBQ Bacon Burger
You:  ¿A cuánto la vendes?

Owner: 189
You:  Quedaría así:
      - **BBQ Bacon Burger** en Hamburguesas
      - **$189.00 MXN**
      ¿Lo damos de alta?

Owner: Sí
You:  [create_product] Listo, ya está en tu menú.
```

---

## Fotos de productos (subidas por el dueño)

When the owner **uploads files** in chat (generic import inbox — images stored as WebP, documents as PDF/DOCX)
or already has images in storage:

Each upload appears in the user message under **## Chat attachments** with `storage_path`,
`kind` (`document` | `image`), and `original_name`. Use those paths directly in tools — **never ask the owner for
storage_path**.

### One photo → one product

`assign_product_image` with `storage_path` + `product_id` or product **name**.

### Many photos

Use **`bulk_assign_product_images`** — `items[]` with `storage_path` + `product_id` or name (up to 50).
Confirm mappings with the owner before assigning.

To **remove** photos (unlink from DB, storage files stay): `remove_product_image` or
`bulk_remove_product_images` with `product_id` or name.

Paths must be under `restaurants/{id}/import/inbox/`, legacy `import/product_photo/`, or `restaurants/{id}/products/`.
On assign, inbox images are copied into `products/` automatically.
Pass `force=true` to replace an existing `image_path`.

For **AI-generated** food photos (no upload), use skill **`menu_media`** → `generate_product_image`.

---

## Perfil del restaurante (nombre, horario, logo, portada)

### Nombre

- **`get_restaurant_name`** — read current display name.
- **`get_restaurant_public_menu_url`** — public link to the digital menu (for sharing with customers).

### Horario

- **`get_restaurant_schedules`** — read rows (`service_type`: `takeout`|`delivery`, `day_of_week`: 0=Mon..6=Sun, `opens_at`/`closes_at` as HH:MM).
- **`set_restaurant_schedules`** — **replace-all** schedule rows after owner confirms.

### Logo y portada (cover)

Chat uploads (`kind: image` in inbox) → assign tools copy into `restaurants/{id}/logo/` or `cover/`:

- **`assign_restaurant_logo`** / **`assign_restaurant_cover`** — set from `storage_path`.
- **`remove_restaurant_logo`** / **`remove_restaurant_cover`** — clear DB path only (no storage delete).

---

## Tema del menú digital

When the owner wants to **change how the public menu looks** — "cambia el tema", "otro diseño",
"menú más oscuro", "estilo taquería" — no import session required.

### Typical flow

1. **`get_current_menu_theme`** (optional) — show what they have now.
2. **`list_menu_themes`** — show real theme labels from the catalog; never invent theme ids.
3. Owner picks a theme by **label** (you map to `theme_id` inside the tool).
4. Short recap → **`apply_menu_theme`** after explicit confirmation.

### Rules

- Confirm the theme **name** with the owner before applying.
- `theme_id` must come from `list_menu_themes` — never guess slugs.
- During an active **menu import**, applying a theme still works and advances the import session.

---

## Available tools

| Tool | Purpose |
|------|---------|
| `create_category` | New category (`name`, optional `description`, `sort_index`) |
| `update_category` | Rename, reorder, set `display_layout` (`vertical` \| `horizontal` \| `grid`), enable/disable regular categories (`category_id` UUID), or rename/enable/disable special aisles (`__dm_promotions__`, `__dm_limited_time__`) |
| `create_product` | New product (`name`, `price_cents`, `category_ids`, optional `description`, optional `status` — default `draft`) |
| `update_product` | Change one product by `product_id` **or** `name`/`product_name`; use `new_name` to rename; `price_cents` in cents (100 MXN = 10000); set `status` (`active` \| `inactive` \| `draft`) for visibility |
| `bulk_update_product_names` | Rename up to 50 products (`items[]` with `new_name` + `product_id` or lookup name) |
| `bulk_update_product_descriptions` | Rewrite up to 50 descriptions in one call (`items[]` with `description` + `product_id` or `name`) |
| `bulk_update_product_prices` | Change up to 50 prices in one call (`items[]` with `price_cents` + `product_id` or `name`) |
| `bulk_update_category_names` | Rename up to 50 categories (`items[]` with `new_name` + `category_id` or name) |
| `bulk_update_category_descriptions` | Update up to 50 category descriptions in one call |
| `bulk_update_category_sort_indices` | Set `sort_index` for up to 50 categories in one call |
| `bulk_update_category_visibility` | Show/hide up to 50 categories (`is_active`; special aisles supported) |
| `bulk_update_category_display_layout` | Set `display_layout` (`vertical` \| `horizontal` \| `grid`) for up to 50 regular categories |
| `set_category_product_order` | Reorder products in one category (`category_id` or `category_name`, ordered `product_ids`; active-only list OK — inactive stay at end) |
| `set_product_option_group_order` | Reorder complement groups on one product (`product_id` or name, ordered `group_ids`; active-only OK) |
| `set_option_group_item_order` | Reorder complements inside one group (`product_id`, `group_id`, ordered `item_ids`; active-only OK) |
| `add_option_group` | Add size/extras group to a product |
| `update_option_group` | Change group rules or disable with `is_active=false` |
| `add_option_item` | Add one add-on choice to a group |
| `update_option_item` | Change label/price or disable with `is_active=false` (`product_id` + `item_id`; `group_id` optional) |
| `bulk_update_option_item_visibility` | Show/hide complements. Prefer `match_label` + `is_active` for menu-wide changes (e.g. Sprite agotado); `items[]` requires `expected_label` per row (`group_id` optional) |
| `bulk_update_option_item_labels` | Rename up to 50 complement labels (`items[]` with `new_label` + `product_id` + `item_id`; `group_id` optional) |
| `bulk_update_option_item_prices` | Change up to 50 complement prices (`price_delta_cents` + `product_id` + `item_id`; `group_id` optional) |
| `bulk_add_option_items` | Add up to 50 complement choices to existing groups (`group_id` + `label`) |
| `bulk_add_option_groups` | Create up to 50 complement groups across products (`title` + optional `items[]`) |
| `delete_option_item` | Permanently remove one complement (`expected_label` + `product_id` + `item_id`; `group_id` optional) |
| `bulk_delete_option_items` | Remove up to 50 complements from **one** product (`product_id`/name + `items[]` with `expected_label`; `group_id` optional per row) |
| `list_menu_themes` | List active digital menu themes (includes `colors` hex map and `typography` fonts) |
| `get_current_menu_theme` | Read current theme id, label, colors, and typography |
| `apply_menu_theme` | Set `digital_menu_theme_id` after owner confirms (`theme_id` from catalog) |
| `assign_product_image` | Assign one uploaded photo (`storage_path`) to a product by id or name |
| `bulk_assign_product_images` | Assign up to 50 uploaded photos (`items[]` with `storage_path` + product) |
| `remove_product_image` | Clear `image_path` on one product (DB only; storage unchanged) |
| `bulk_remove_product_images` | Clear photos on up to 50 products by id or name |
| `get_restaurant_name` | Read restaurant display name |
| `get_restaurant_public_menu_url` | Read public digital menu URL (customer share link) |
| `get_restaurant_schedules` | Read opening hours schedule rows |
| `set_restaurant_schedules` | Replace-all restaurant schedule rows |
| `assign_restaurant_logo` | Set logo from chat upload (`storage_path`) |
| `remove_restaurant_logo` | Clear logo_path (DB only) |
| `assign_restaurant_cover` | Set cover/header from chat upload |
| `remove_restaurant_cover` | Clear cover_path (DB only) |

Prices are always in **cents** (e.g. $24.40 → `2440`).

---

## Typical flow

```
Owner request (change or improve menu)
  → load_skill(menu_best_practices)   ← required for improve/optimize/recommend/audit
  → load_skill(menu_write)            ← optional; only if you need this mutate guide
  → menu_read tools to fetch current state
  → menu_write mutate tool(s)
  → Answer summarizing what changed (owner-facing Markdown, no raw JSON keys)
```

---

## Reply style after a write

- Confirm what changed in plain Spanish for the restaurant owner.
- Mention product/category names, not UUIDs, unless the owner asked for IDs.
- If a tool fails, explain in plain language and suggest a read-only check with `menu_read`.

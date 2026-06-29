# Live menu product — read-only reference

Concise overview of what a **product** contains, what each field means in the **live (public) menu**, which **database tables** supply the data, and how the **line total** is calculated.

> **Data source for the live menu:** `GET /public/menu/{subdomain}` → `FullMenuDTO`  
> **Backend assembly:** `MenuRepository.get_full_menu()` → `_load_menu_products(published_only=True)`  
> **Frontend product detail:** `DigitalMenuProductDetail` + `productOptionSelection.ts`

---

## 1. What is a product?

A product is a sellable menu item owned by one restaurant. It has:

- **Identity & copy** — name, description, image
- **Base price** — stored in cents (`price_cents`), plus currency
- **Catalog placement** — zero or more categories, each with a display order
- **Modifiers** — zero or more **option groups**, each with **option items** (extras, sizes, toppings, etc.)
- **Lifecycle flags** — draft/review/publish workflow and soft-delete (`is_active`)

The live menu only **reads** this data. Customers pick options and quantity; the app computes the running total client-side, then the backend re-prices the cart (including promotions) at checkout quote time.

---

## 2. Live menu: opening a product

When a customer taps a product card, the UI renders everything from the `Product` object already loaded with the full menu. No separate “product detail” API call.

### 2.1 Product fields shown

| Field | Meaning | Live menu usage |
|-------|---------|-----------------|
| `id` | Stable UUID | Cart lines, order items, option selections keyed by group id |
| `name` | Product title | Hero heading, cart, checkout |
| `description` | Long text or `null` | Shown under the name when present |
| `image_path` | Storage object path (not a full URL) | Resolved to a public URL via `storagePublicUrl()` for the hero image |
| `price_cents` | **Base price in cents** (integer) | Starting unit price before options; displayed as `price_cents / 100` |
| `currency` | ISO code (default `MXN`) | Money formatting |
| `is_active` | Soft-delete flag (`true` = available) | If `false`, product is shown as unavailable; **Add to cart** is disabled |
| `category_ids` | Categories this product belongs to | Used to list/filter products and to match category-scoped promotions |
| `category_sort_indices` | Map `{ category_id → sort_index }` | **Display order within each category** (lower = appears first) |
| `option_groups` | Nested modifier groups | Rendered as expandable sections on the product detail screen |

**Not shown to customers (but present in API payload):** `restaurant_id`, `approval_status`, `is_published`, `created_at`, `updated_at`. The public menu endpoint already filters to published + approved products.

### 2.2 Base price vs promotional price

`price_cents` is always the **catalog base price** in the database. It is **not** the post-promotion price.

On the product detail screen, the UI may show a lower **unit price** when a catalog percent/amount promotion applies (`resolveMenuProductDiscount()`). Bundle/combo promos show badges but do not change the per-unit display price until quantity rules apply at cart quote time.

For full promotion behavior see [`promociones-referencia.en.md`](./promociones-referencia.en.md).

---

## 3. Option groups and option items

Option groups let the customer customize a product (size, extras, removals, etc.).

### 3.1 Option group fields

| Field | DB column | Meaning |
|-------|-----------|---------|
| `id` | `option_groups.id` | UUID; used as key in customer selections |
| `product_id` | `option_groups.product_id` | Parent product |
| `title` | `option_groups.title` | Section heading (e.g. “Size”, “Extras”) |
| `required` | `option_groups.required` | Customer **must** satisfy selection rules before adding to cart |
| `selection` | `option_groups.selection` | `single` = pick at most one item; `multi` = pick zero or more |
| `min_selections` | `option_groups.min_selections` | Minimum items to pick in a **multi** group (ignored for `single`) |
| `max_selections` | `option_groups.max_selections` | Maximum items in **multi** group; `null` = no upper limit |
| `sort_index` | `option_groups.sort_index` | **Display order** among groups on the product page (lower = higher on screen) |
| `is_active` | `option_groups.is_active` | Inactive groups are **hidden** on the live menu |
| `items` | `option_items` rows | Choices inside this group |

### 3.2 Option item fields

| Field | DB column | Meaning |
|-------|-----------|---------|
| `id` | `option_items.id` | UUID; stored in cart `selected_options` |
| `label` | `option_items.label` | Customer-facing name (e.g. “Large”, “Extra cheese”) |
| `price_delta_cents` | `option_items.price_delta_cents` | **Added to unit price** when selected (can be `0`) |
| `sort_index` | `option_items.sort_index` | **Display order** within the group (lower = first) |
| `is_active` | `option_items.is_active` | Inactive items are **hidden** on the live menu |

The live menu runs `activeOptionGroups()`: keeps only active groups/items, sorts by `sort_index`, and drops empty groups.

### 3.3 Selection types

| `selection` | Customer behavior | Typical UI hint |
|-------------|-------------------|-----------------|
| `single` | Choose **exactly one** item if `required`, or **zero or one** if optional | “Choose 1” / “Choose 1 · Required” |
| `multi` | Choose between `min_selections` and `max_selections` items | “Up to 2 options”, “Choose 1–2 · Required”, etc. |

### 3.4 What “required”, “minimum”, and “maximum” mean

**`required = true`**

- **`single`:** customer must pick **exactly one** item in the group.
- **`multi`:** customer must pick at least `max(1, min_selections)` items.

**`required = false`**

- Group is optional; customer may leave it empty.
- For `multi`, if they do pick, they must still respect `min_selections` / `max_selections`.

**`max_selections = 2` (example)**

- In a **multi** group, the customer can select **at most two** items.
- UI blocks further toggles once two are selected.
- If the group is also required with `min_selections = 1`, valid range is **1–2** items.

Validation logic: `isGroupRequirementMet()` and `canAddProductToCart()` in `productOptionSelection.ts`.

### 3.5 What `sort_index` means

`sort_index` is a **display-order integer**, not a customer-facing label.

| Location | Effect |
|----------|--------|
| `categories.sort_index` | Category order in the menu sidebar / tabs |
| `product_categories.sort_index` | Product order **inside a category** (exposed as `category_sort_indices`) |
| `option_groups.sort_index` | Option section order on the product detail page |
| `option_items.sort_index` | Choice order inside each option section |

Lower values appear first. Ties break by `created_at` in the backend query.

---

## 4. Customer selections (cart payload)

When adding to cart, selections are stored as:

```json
{
  "<option_group_id>": ["<option_item_id>", "<option_item_id>"]
}
```

- Keys are **option group UUIDs** (strings).
- Values are **arrays of option item UUIDs**.
- `single` groups always have 0 or 1 id in the array.
- `multi` groups may have several ids, bounded by `max_selections`.

This shape is sent to `POST /public/restaurants/{subdomain}/cart/quote` and persisted on `order_items.selected_options` (JSONB).

---

## 5. Database tables

```
restaurants
    └── categories
    └── products ──┬── product_categories (M:N + sort_index)
                   └── option_groups ── option_items
```

### 5.1 `products`

| Column | Type | Meaning |
|--------|------|---------|
| `id` | UUID | Primary key |
| `restaurant_id` | UUID | Owner restaurant |
| `name` | text | Product name |
| `description` | text, nullable | Long description |
| `price_cents` | integer | **Base unit price in cents** |
| `currency` | char(3) | Default `MXN` |
| `image_path` | text, nullable | Object storage path for product photo |
| `approval_status` | enum string | `draft` \| `pending_review` \| `approved` \| `rejected` |
| `is_published` | boolean | Must be `true` for live menu |
| `is_active` | boolean | Soft delete; `false` = unavailable |
| `created_at`, `updated_at` | timestamptz | Audit timestamps |

**Live menu filter:** `is_published = true` AND `approval_status = 'approved'`.

### 5.2 `categories`

| Column | Meaning |
|--------|---------|
| `name`, `description`, `image_path` | Category display |
| `sort_index` | Menu category order |
| `display_layout` | `vertical` \| `horizontal` \| `grid` — card layout in category |
| `is_active` | Inactive categories omitted from public menu |

### 5.3 `product_categories` (join table)

| Column | Meaning |
|--------|---------|
| `product_id`, `category_id` | Many-to-many link |
| `sort_index` | Product position **within that category** → API field `category_sort_indices` |

### 5.4 `option_groups`

| Column | Meaning |
|--------|---------|
| `product_id` | Parent product |
| `title` | Group label |
| `required` | Must satisfy rules before add-to-cart |
| `selection` | `single` or `multi` |
| `min_selections` | Min picks (multi) |
| `max_selections` | Max picks (multi); nullable = unlimited |
| `sort_index` | Group display order |
| `is_active` | Hidden when false |

### 5.5 `option_items`

| Column | Meaning |
|--------|---------|
| `option_group_id` | Parent group |
| `label` | Choice label |
| `price_delta_cents` | Cents added per unit when selected |
| `sort_index` | Item display order within group |
| `is_active` | Hidden when false |

---

## 6. How the product total is calculated

### 6.1 On the product detail screen (client preview)

```
options_total_cents = sum(price_delta_cents) for each selected active option item
unit_price          = promotional base (if catalog discount) else price_cents / 100
line_total          = (unit_price + options_total_cents / 100) × quantity
```

Implemented in `selectedOptionsTotalCents()` and `computeLineTotal()`.

**Important:** this preview applies **simple catalog discounts** on the base price only. Bundle (N×M), order-level promos, and cross-line pairing are resolved later by the backend cart quote.

### 6.2 At cart / checkout (authoritative)

Backend `price_cart()` (`backend/app/modules/promotions/pricing.py`):

```
unit_base_cents     = products.price_cents
options_cents       = sum(selected option_items.price_delta_cents)   // active items only
unit_effective      = unit_base_cents + options_cents                  // before line promos

line_subtotal       = unit_effective × quantity
line_total          = line_subtotal − best applicable line promotion
```

- **Options are always additive** on top of base price.
- **Bundle promos** may waive base price on some units; option deltas are usually still charged (see pricing module for waived option ids).
- **Order-scope promos** apply after all lines are summed.

Endpoint: `POST /public/restaurants/{subdomain}/cart/quote`.

Persisted on order creation in `order_items`:

| Column | Meaning |
|--------|---------|
| `unit_price_cents` | Unit price including options (pre-discount snapshot) |
| `line_subtotal_cents` | Line before discount |
| `discount_cents` | Promotion discount on this line |
| `line_total_cents` | **Final line total charged** |
| `selected_options` | JSON snapshot of group → item ids |
| `applied_promotion_id` | Winning promotion, if any |

---

## 7. Read-only access (assistant / admin tools)

The assistant `menu_read` skill reads the same domain model via `MenuService`, but exposes a **subset** of fields (no `sort_index` on groups/items in the tool payload, no promotional price):

- `list_products`, `get_product`, `search_products` → `_product_payload()`
- Base price only: `price_cents` from `products.price_cents`

For promotion-aware pricing in read-only tools, promotions must be loaded separately from `promotions` + join tables and passed through `price_cart()` or equivalent logic.

---

## 8. Quick mental model

| Question | Answer |
|----------|--------|
| Where is the list price stored? | `products.price_cents` |
| Where is “+$15 for large” stored? | `option_items.price_delta_cents` |
| What controls “pick up to 2 extras”? | `option_groups.selection = 'multi'`, `max_selections = 2` |
| What controls section order on the product page? | `option_groups.sort_index`, then `option_items.sort_index` |
| What controls product order in a category? | `product_categories.sort_index` |
| Is discounted price stored on the product row? | **No** — computed from `promotions` at quote time |
| What is the final charged amount? | `order_items.line_total_cents` after order is placed |

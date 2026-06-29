# menu_read

Read-only access to the current restaurant menu: categories, products, prices, option groups, and availability. All data is tenant-scoped; never mutate menu records from this skill.

---

## When to Use This Skill

Activate `menu_read` when the owner asks about **live catalog data** that is not already in:

- Conversation history or prior tool results in this turn
- The `## MENU knowledge` block in the system prompt

Typical intents:

- List or count categories
- Browse all products (paginated) or products in one category
- Search products by name or description
- Get full detail for one product (price, add-ons, status)

**Do not use** when a direct `type: "answer"` is enough (greetings, identity, general advice, data already in context).

---

## How to Use This Skill

Follow this workflow on every menu question:

### Step 1: Classify the Intent

| Owner asks… | Likely tool |
|-------------|-------------|
| "¿Qué categorías tengo?" | `list_categories` |
| "Lista todos mis productos" / "¿cuántos productos tengo?" | `list_products` (paginate with `cursor`) |
| "Productos de la categoría Tacos" | `list_categories` first if needed, then `list_products` + `category_id` |
| "Busca tacos al pastor" / "¿tienes X?" | `search_products` + `query` |
| "Detalle del producto {id}" / after search by id | `get_product` + `product_id` |

### Step 2: Prefer the Smallest Read

1. **Default:** answer from context/MENU knowledge if accurate.
2. **Text lookup:** `search_products` when the owner names or describes items.
3. **Full catalog / counts:** `list_products` with pagination — never guess totals.
4. **Single record:** `get_product` when you already have a UUID.

### Step 3: Paginate Large Result Sets

When `list_products` returns `has_more: true`:

- Tell the owner you are showing one page.
- Call again with `cursor` from the previous response if they need more.
- Default `limit` is 20 (max 50).

### Step 4: Respond in Spanish

Tool `reason` fields stay in English (JSON contract). Owner-facing `content` is Spanish markdown with prices formatted for humans (e.g. `$120.00 MXN` from `price_cents`).

---

## Tool Reference

### `list_categories`

| | |
|---|---|
| **Args** | `{}` (none) |
| **Returns** | Active categories: `id`, `name`, `description`, `sort_index` |
| **Use when** | Owner needs category names/ids before filtering products |

### `list_products`

| Arg | Required | Meaning |
|-----|----------|---------|
| `category_id` | no | UUID of one category; omit for all categories |
| `cursor` | no | From previous `list_products` response |
| `limit` | no | Page size (default 20, max 50) |

**Returns:** `products[]`, `next_cursor`, `has_more`, `limit`, optional `category_id`

**Use when:** Full browse, "how many products", or all items in one category.

### `search_products`

| Arg | Required | Meaning |
|-----|----------|---------|
| `query` | yes | Substring match on name + description (case-insensitive) |

**Returns:** Up to 20 matching **active** products.

**Use when:** Named item lookup ("pastor", "limonada"), not full catalog export.

### `get_product`

| Arg | Required | Meaning |
|-----|----------|---------|
| `product_id` | yes | Product UUID |

**Returns:** One product with `option_groups`, prices, flags.

**Use when:** Detail view or confirming a single id from search/list.

---

## Product Payload Fields

Each product includes:

| Field | Meaning |
|-------|---------|
| `id` | UUID string |
| `name`, `description` | Display text |
| `price_cents`, `currency` | Base price |
| `is_active`, `is_published`, `approval_status` | Lifecycle flags |
| `category_ids` | Category memberships |
| `option_groups` | Add-ons / modifiers with `price_delta_cents` |

Never invent values missing from tool results.

---

## Example Workflows

### "¿Cuántos productos tengo en total?"

1. Call `list_products` with `{}`, note `products.length` and `has_more`.
2. If `has_more`, paginate with `cursor` until `has_more` is false; sum counts.
3. Answer: total active products listed across pages.

### "Muéstrame los productos de Bebidas"

1. `list_categories` → find Bebidas `id` (or use id if owner gave it).
2. `list_products` with `{ "category_id": "<uuid>" }`.
3. If `has_more`, offer next page or fetch with `cursor`.

### "¿Cuánto cuesta el taco al pastor?"

1. Prefer `search_products` `{ "query": "pastor" }`.
2. If multiple matches, clarify or list options.
3. Format `price_cents` in Spanish for the owner.

---

## Rules (Do / Don't)

| Do | Don't |
|----|-------|
| Use tools for live DB data when context is insufficient | Invent prices, counts, or categories |
| Paginate with `list_products` for large menus | Assume `search_products` returns the full catalog |
| Scope every call to the current restaurant tenant | Reference other restaurants |
| Say when data is partial (page 1 of N) | Claim you edited or disabled products |
| Use `get_product` for one known UUID | Call tools "just in case" when MENU knowledge suffices |

---

## Pre-Response Checklist

Before sending `type: "answer"` after tool calls:

- [ ] Numbers (counts, prices) come from tool JSON, not guesses
- [ ] Pagination state explained if `has_more` was true
- [ ] Inactive/unpublished products noted when relevant
- [ ] Spanish markdown in `content`; English only in `reason`
- [ ] No delete/mutate actions — this skill is read-only

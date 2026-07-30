# Bulk create products & categories — Diseño

> **Estado:** aprobado para plan (2026-07-30).  
> **Alcance:** dos tools nuevas en `MenuWriteSkill` — `bulk_create_products` y `bulk_create_categories` — disponibles en `catalog_agent` vía el registry de skills. Solo **crear** (no update).  
> **Fuera de alcance:** skills separadas; API HTTP nueva de bulk; rollback transaccional si fallan option groups a mitad de fila; cambiar el flujo secretaria de `create_product` singular.

---

## 1. Objetivo

Permitir que el catalog agent dé de alta **varios productos completos** (con conjuntos de complementos / add-ons) y **varias categorías** en una sola llamada cada uno, sin pasar por el onboarding de un producto.

### Decisiones acordadas

| Decisión | Elección |
|----------|----------|
| Dónde viven | `MenuWriteSkill` (no skills nuevas) |
| Tools | `bulk_create_products`, `bulk_create_categories` (separadas) |
| Campo obligatorio producto | Solo `name` |
| Precio omitido | `price_cents = 0` |
| Status default bulk product | `active` (visible en live menu) |
| Sin categoría | Permitido (`category_ids = []`); relajar `MenuService.create_product` |
| Descripción / imagen omitidas | `null` |
| Confirmación agent | Crear directo si el dueño ya mandó la lista (sin recap obligatorio) |
| Límite | 50 items por call (`BULK_DEFAULT_LIMIT`) |
| Partial success | Sí, por fila (patrón bulk existente) |

---

## 2. Contexto actual

- `create_product` / `create_category` son de a uno.
- Bulk existente: updates (`bulk_update_product_*`, `bulk_update_category_*`) y add de opciones (`bulk_add_option_groups`, `bulk_add_option_items`).
- `MenuService.create_product` hoy exige `len(category_ids) >= 1`.
- `OptionGroupCreate` ya acepta `items: list[OptionItemCreate]` anidados en un solo `add_option_group`.
- `catalog_agent` obtiene tools de skills entitladas vía `build_executor_function_tools`.

---

## 3. Arquitectura

```text
catalog_agent
  └─ MenuWriteSkill
        ├─ bulk_create_categories(items[])
        │     └─ MenuService.create_category per row
        └─ bulk_create_products(items[])
              ├─ resolve category_ids / category_names (optional)
              ├─ MenuService.create_product (price default 0, status active, cats optional)
              └─ for each option_group → MenuService.add_option_group(... items=[])
```

### 3.1 Componentes

| Unidad | Responsabilidad |
|--------|-----------------|
| `menu_write/bulk_create.py` | Parsers + `bulk_create_products` / `bulk_create_categories` |
| `menu_write/tools.py` | `ToolDefinition` + dispatch |
| `menu/service.py` | Permitir `category_ids=[]` en `create_product`; si hay IDs, validar tenant |
| `menu_write/SKILL.md` | Guía de uso (bulk create directo; secretaria sigue para 1 producto) |
| `tool_catalog.py` | Hints compactos Args/Returns |

No hay endpoint HTTP nuevo: solo tools del assistant.

---

## 4. Contrato de tools

### 4.1 `bulk_create_categories`

**Effect:** `mutate`

**Args:**
- `items` (array, required, max 50), cada item:
  - `name` (string, required)
  - `description` (string, optional)
  - `sort_index` (int, optional, default 0)

**Returns:** summary estilo bulk + `results[]` (`id`, `ok`, `label`, `error`).

**Notas:** nombres duplicados en el mismo batch se crean ambos (mismo comportamiento que `create_category` hoy).

### 4.2 `bulk_create_products`

**Effect:** `mutate`

**Args:**
- `items` (array, required, max 50), cada item:
  - `name` (string, required)
  - `price_cents` (int, optional, default `0`)
  - `description` (string, optional)
  - `image_path` (string, optional)
  - `currency` (string, optional, default `MXN`)
  - `status` (enum, optional, default `active`)
  - `category_ids` (uuid[], optional) y/o `category_names` (string[], optional)
  - `option_groups` (array, optional), cada group:
    - `title` (string, required)
    - `required`, `selection` (`single`\|`multi`), `min_selections`, `max_selections`, `sort_index` (opcionales; mismos defaults que `add_option_group`)
    - `items` (array de add-ons):
      - `label` (required)
      - `price_delta_cents` (default 0)
      - `sort_index` (default 0)

**Returns:** summary bulk + `results[]` por producto (`id`, `ok`, `label`, `error`; opcionalmente campos creados / groups count en `changed_fields` o data auxiliar si el helper bulk lo permite sin romper el shape).

**Defaults de producto:**
- Sin precio → `0`
- Sin status → `active`
- Sin categorías → `[]` (válido)
- Sin description/image → omitidos / `null`

### 4.3 Relajación de service

```text
create_product:
  - if category_ids: ensure all belong to restaurant
  - if category_ids empty: allow create (no ValidationError)
```

`update_product` con `category_ids=[]` **no** cambia en este diseño (sigue exigiendo ≥1 si se envía la lista); solo create.

---

## 5. Errores y edge cases

| Caso | Comportamiento |
|------|----------------|
| Fila sin `name` | `ok=false`, no crea |
| Categorías inválidas / nombre no encontrado / nombre ambiguo | `ok=false` en esa fila, no crea producto |
| `option_groups` inválido tras crear producto | Producto queda creado; fila `ok=false` con error de complements; **sin rollback** |
| Más de 50 items | Tool falla entero (mensaje de límite) |
| Partial batch | Unas filas OK, otras no — summary refleja conteos |

---

## 6. Comportamiento del agent (SKILL.md)

- Alta de **un** producto conversacional: sigue el flujo secretaria + `create_product`.
- Alta de **varios** / lista ya dada: usar `bulk_create_products` / `bulk_create_categories` **sin** recap obligatorio.
- Preferir bulk create en lugar de loop de `create_product` / `create_category`.
- Complements: preferir anidar en `bulk_create_products.option_groups` en la misma llamada; `bulk_add_option_*` queda para productos ya existentes.

---

## 7. Testing

- Service: `create_product` con `category_ids=[]` OK; IDs inválidos siguen fallando; con IDs válidos OK.
- Tools:
  - `bulk_create_categories`: solo name; name + description
  - `bulk_create_products`: solo name → price 0, active, sin cat
  - producto con categories + option_groups/items
  - partial failure (una fila mala, una OK)
  - over-limit → error de tool

---

## 8. Enfoque de implementación

Helpers nuevos en `bulk_create.py` reutilizando `_parse_items`, `BulkRowResult`, `bulk_tool_result`, y el parser de nested option items de `option_item_bulk` (extraer/compartir si hace falta sin duplicar lógica frágil). Wiring en `tools.py` + docs/catalog hints.

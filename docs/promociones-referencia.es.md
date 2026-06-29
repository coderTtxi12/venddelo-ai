# Promociones — referencia de solo lectura

Documento conciso: qué tipos existen, de dónde se leen en el menú live, qué tablas intervienen y cómo afectan el total del carrito.

> **Fuente de verdad del precio:** el backend en `price_cart()` (`backend/app/modules/promotions/pricing.py`).  
> El menú público **muestra** promociones; el **cálculo final** ocurre en `POST /public/restaurants/{subdomain}/cart/quote`.

---

## 1. Tipos de promoción

| Tipo en API / UI | Tipo en DB (`promotions.type`) | ¿Precio en carrito? | Origen típico |
|------------------|--------------------------------|---------------------|---------------|
| **NxM / bundle / 2×1** | `two_for_one` | Sí | Marketing (`/marketing`) |
| **Porcentaje** | `percent` | Sí | Marketing o descuento de catálogo |
| **Monto fijo** | `amount` | Sí | Marketing o descuento de catálogo |
| **Combo** | `combo` | **No** (solo badge en menú) | Marketing (legacy) |
| **Descuento de catálogo** | `percent` o `amount` | Sí | Editor de producto (Products) |

**Alias:** la API expone `bundle` / `2x1`; en Postgres se guarda como `two_for_one`.

### Alcance (`scope`)

| `scope` | Significado | Tipos permitidos |
|---------|-------------|------------------|
| `product` | Aplica a productos ligados en `promotion_products` | percent, amount, combo, two_for_one |
| `category` | Aplica a productos de categorías en `promotion_categories` (opcional: filtro por `product_ids`) | percent, amount, combo, two_for_one |
| `order` | Descuento sobre el subtotal del pedido completo | percent, amount |

---

## 2. Tablas y campos (Postgres)

### `promotions`

| Campo | Significado |
|-------|-------------|
| `id` | UUID de la promoción |
| `restaurant_id` | Restaurante dueño |
| `name` | Nombre visible. Los descuentos de catálogo usan prefijo `__product_discount__` + nombre del producto |
| `type` | `percent`, `amount`, `combo`, `two_for_one` |
| `scope` | `product`, `category`, `order` |
| `percent` | 1–100 (solo si `type = percent`) |
| `amount_cents` | Descuento fijo en centavos (solo si `type = amount`) |
| `min_order_cents` | Pedido mínimo para promos de alcance `order` |
| `bundle_get_quantity` | **N** en N×M (ej. 2 en 2×1) |
| `bundle_pay_quantity` | **M** unidades que paga el cliente (ej. 1 en 2×1). Debe ser `< get_quantity` |
| `bundle_pairing_mode` | `cross_product` (mezcla productos) o `same_product` (mismo SKU) |
| `image_path` | Imagen del banner en menú público (marketing) |
| `starts_at` / `ends_at` | Vigencia de campaña |
| `recurrence_weekdays` | Días 0=Lun … 6=Dom; vacío = todos los días |
| `recurrence_start_time` / `recurrence_end_time` | Ventana horaria diaria (timezone del restaurante) |
| `is_active` / `deleted_at` | Activa / borrado lógico |

### Tablas de relación

| Tabla | Uso |
|-------|-----|
| `promotion_products` | Qué productos participan (`promotion_id`, `product_id`) |
| `promotion_categories` | Qué categorías participan (`promotion_id`, `category_id`) |
| `promotion_option_items` | Complementos permitidos en bundles; complementos exentos en percent/amount |

### Persistencia en pedidos (snapshot al cobrar)

| Tabla | Campos relevantes |
|-------|-------------------|
| `orders` | `subtotal_before_discount_cents`, `discount_cents`, `applied_order_promotion_id`, `applied_order_discounts` (JSONB) |
| `order_items` | `line_subtotal_cents`, `discount_cents`, `line_total_cents`, `applied_promotion_id`, `applied_discounts` (JSONB) |

### Config del menú (`restaurants`)

| Campo | Uso |
|-------|-----|
| `timezone` | Evalúa si la promo está vigente ahora |
| `digital_menu_promotions_category_*` | Sección virtual “Promociones” |
| `digital_menu_limited_time_category_*` | Sección “Por tiempo limitado” (productos con descuento) |

---

## 3. Menú live — cómo se lee una promoción 2×1

### Flujo de datos

```
PublicDigitalMenuPage
  → GET /public/restaurants/{subdomain}/promotions   (promos efectivas + server_now)
  → GET /public/menu/{subdomain}                     (productos, categorías, precios)
  → cache local: venddelo:public-promotions:{subdomain}
```

**Archivos frontend clave:**
- `frontend/src/components/pages/PublicDigitalMenuPage.tsx` — carga inicial
- `frontend/src/lib/promotions/publicPromotionsCache.ts` — cache
- `frontend/src/lib/promotions/promotionShortcuts.ts` — banners N×M
- `frontend/src/lib/promotions/menuProductDiscount.ts` — badges en tarjetas de producto

### Qué significa “2×1” en pantalla

Una promo `two_for_one` con `bundle_get_quantity = 2` y `bundle_pay_quantity = 1`:

- El cliente **lleva 2 unidades** y **paga 1**.
- Badge en menú: `2×1` (formato `{get}×{pay}`).
- Slogan típico: “Pide 2, paga 1”.
- **Solo el precio base** del producto puede salir gratis; los **complementos con costo siempre se cobran**.
- Con `bundle_pairing_mode = same_product`: las 2 unidades deben ser **del mismo producto**.
- Con `cross_product`: pueden mezclarse productos distintos del pool de la promo.

### Banners vs tarjetas

| Elemento | Condiciones | Datos usados |
|----------|-------------|--------------|
| **Banner acceso directo** | No es descuento de catálogo, no es `scope=order`, tiene `image_path`, vigente, ≥1 producto | `name`, `image_path`, `bundle`, schedule |
| **Badge en producto** | Producto participa en promo vigente | `type`, `percent`, `amount`, `bundle` |

Los banners **no calculan precio**; al tocarlos se listan productos participantes (`PromotionShortcutProductsView`).

### Vigencia (“¿está activa ahora?”)

Backend: `is_promotion_effective()` — `backend/app/modules/promotions/effective.py`

Debe cumplir: `is_active`, ventana `starts_at`/`ends_at`, día de la semana y horario recurrente (en timezone del restaurante).

---

## 4. Cálculo del total — promoción N×M (2×1)

Motor: `price_cart()` en `backend/app/modules/promotions/pricing.py`.

### Paso a paso (bundle)

1. Se filtran promos **efectivas** con `type = two_for_one` y `scope` producto/categoría.
2. Se expande el carrito en **unidades** (cantidad × líneas).
3. Cada unidad aporta `base_cents` (precio base del producto, ya con descuento de catálogo si aplica) + `options_cents` (complementos).
4. Solo unidades que cumplen reglas de complementos (`promotion_option_items`) entran al pool del bundle.
5. **Emparejamiento** (`_allocate_cross_bundle_free_bases`):
   - Ordena bases de menor a mayor precio.
   - **2×1:** empareja la más barata con la más cara (alternando extremos).
   - **N×M general:** grupos de `get_quantity`; las `get_quantity - pay_quantity` más baratas de cada grupo salen gratis.
6. Si hay varias promos bundle candidatas, gana la que deja **menor total de carrito**.
7. `line_total = (bases cobradas + todos los complementos) × unidades`.

### Fórmula resumida por línea

```
subtotal_línea_sin_promo = (precio_base + complementos) × cantidad
descuento_bundle         = suma de bases gratuitas por emparejamiento
total_línea              = subtotal_línea_sin_promo - descuento_bundle
```

Los complementos **nunca** se descuentan en un bundle.

### API de cotización

```
POST /public/restaurants/{subdomain}/cart/quote
```

Frontend: `useCheckoutCartQuote.ts` → desglose en `buildCheckoutLineBreakdown.ts` → UI en `PublicMenuCheckoutSummary.tsx`.

---

## 5. Descuentos por producto (porcentaje / monto fijo)

Hay **dos orígenes** con el mismo tipo en DB, distinto propósito:

### A) Descuento de catálogo (al crear/editar producto)

**No vive en `products`.** Se guarda como fila en `promotions`:

| Regla | Valor |
|-------|-------|
| `name` | `__product_discount__` + nombre del producto |
| `scope` | `product` |
| `type` | `percent` o `amount` |
| `promotion_products` | Exactamente 1 producto |

**Escritura:** `syncProductCatalogDiscount()` — `frontend/src/lib/promotions/productCatalogDiscount.ts`  
(al guardar producto en `supplierProducts.ts`).

**Lectura en menú live:**
- API pública de promociones (misma lista que marketing bundles).
- `buildMenuProductDiscountMap()` — badge `-X%` o precio tachado.
- `buildProductCatalogDiscountMapFromPromotions()` — mapa producto → descuento USD (admin).

**Identificación en backend:**
```python
_is_catalog_discount_promo(promo, product_id)
# scope=product, type in (percent, amount), name.startswith("__product_discount__")
```

### B) Promoción manual percent/amount (Marketing)

Misma tabla `promotions`, pero:
- `name` **sin** prefijo `__product_discount__`
- Puede ser `scope=product`, `category` u `order`
- Requiere `image_path` para banners (excepto catálogo)

---

## 6. Cálculo del total — percent y amount

### Sobre línea de producto (`scope = product | category`)

**Subtotal de línea:**
```
line_subtotal = (precio_base + complementos_cobrables) × cantidad
```

**Porcentaje:**
```
discount = round(line_subtotal × percent / 100)
line_total = line_subtotal - discount
```

**Monto fijo (producto):**
```
discount = min(amount_cents × cantidad, line_subtotal)
line_total = line_subtotal - discount
```

**Complementos exentos:** si la promo define `promotion_option_items`, esos extras **no entran** al subtotal antes del descuento (se “regalan”).

**Descuento de catálogo vs promo de línea:** en la misma unidad, el motor elige la combinación **más barata** para el cliente (no acumula dos promos de línea).

### Descuento de catálogo (solo base)

Antes de bundles u otras promos de línea, la base puede reducirse:

```python
# percent
base_descontada = round(precio_base × (100 - percent) / 100)

# amount
base_descontada = max(0, precio_base - amount_cents)
```

Esa base descontada es la que usa el emparejamiento N×M.

### Sobre pedido completo (`scope = order`)

Después de sumar todas las líneas:

```
lines_subtotal = Σ line_total de cada línea

# percent
order_discount = round(lines_subtotal × percent / 100)

# amount
order_discount = min(amount_cents, lines_subtotal)

total = lines_subtotal - order_discount
```

Solo aplica si `lines_subtotal >= min_order_cents`. Gana **una sola** promo de pedido (la de mayor descuento).

---

## 7. Resumen visual del pipeline de precio

```
Carrito (productos + cantidades + complementos)
        │
        ▼
¿Promo bundle N×M vigente? ──► empareja unidades, bases gratis
        │
        ▼
¿Promo percent/amount de línea? ──► descuento sobre subtotal de línea
        │                              (vs mejor bundle: gana la más barata)
        ▼
¿Descuento catálogo en base? ──► reduce precio base antes de bundle
        │
        ▼
lines_subtotal = suma de líneas
        │
        ▼
¿Promo order percent/amount? ──► descuento sobre pedido
        │
        ▼
total_cents
```

---

## 8. Qué no hace el menú live (importante)

| Comportamiento | Detalle |
|----------------|---------|
| Subtotal en barra del carrito | Estimación local; **no** es el total final |
| Tipo `combo` | Solo etiqueta “Combo”; **sin** matemática en checkout |
| Acumular 2 promos de línea | No; se elige la más favorable |
| Acumular 2 promos de pedido | No; gana una |
| Catálogo + bundle | Sí: catálogo baja la base, luego el bundle empareja sobre esa base |

---

## 9. Índice de archivos

| Tema | Ruta |
|------|------|
| Modelo DB | `backend/app/db/models/promotions.py` |
| Motor de precio | `backend/app/modules/promotions/pricing.py` |
| Vigencia | `backend/app/modules/promotions/effective.py` |
| API pública | `backend/app/modules/public/api.py` |
| Menú live | `frontend/src/components/pages/PublicDigitalMenuPage.tsx` |
| Descuento catálogo | `frontend/src/lib/promotions/productCatalogDiscount.ts` |
| Badges menú | `frontend/src/lib/promotions/menuProductDiscount.ts` |
| Cotización checkout | `frontend/src/lib/digital-menu/cart/useCheckoutCartQuote.ts` |
| Desglose UI | `frontend/src/lib/digital-menu/cart/buildCheckoutLineBreakdown.ts` |
| Marketing (NxM) | `frontend/src/components/marketing/PromotionForm.tsx` |

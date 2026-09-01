# Cupones — diseño full stack

> **Status:** pending user review before implementation plan.
> **Approach:** A — módulo `coupons` aparte de Marketing.
> **Scope:** persistencia, motor de aplicación, carrito del menú live, crear pedido, aceptar en Órdenes, página del dashboard.
> **Explicitly out of scope:** varios cupones por pedido, límite por cliente, pedido mínimo, fecha de inicio, auto-aplicar sin código, cron de caducidad, cupones en delivery-dashboard, mezclar cupones dentro de `promotions`.

---

## 1. Goal

El dueño crea códigos de descuento en el dashboard. El cliente los escribe en el carrito del menú live. El servidor calcula el descuento. Las existencias se gastan solo al **aceptar** el pedido en Órdenes.

### Acceptance

Dueño crea `PIZZA20` (20%, categorías Pizzas, 50 usos, caduca el 30 sep). Cliente con pizza + bebida aplica el código: 20% solo sobre la pizza, encima de un 2×1 de Marketing si existe. Pickup rechaza un cupón de envío gratis. Con existencias en 0 el carrito no aplica el código. Dos pedidos pendientes con el último uso: el segundo se puede confirmar con aviso; los precios y el cupón del snapshot se respetan.

---

## 2. Confirmed decisions

| Decision | Choice |
|----------|--------|
| Arquitectura | Módulo `coupons`, no extender `promotions` |
| Stacking con Marketing | Cupón **encima** de promociones automáticas |
| Cupones por pedido | **Uno**. Otro código reemplaza al anterior |
| Existencias | Usos totales. `null` = ilimitado |
| Cuándo se gasta | Solo `pending` → `confirmed` en Órdenes |
| Carrito si stock = 0 | No aplica; error visible |
| Órdenes si stock = 0 al aceptar | Se puede confirmar; warning; **mismos precios y cupón** |
| Alcance mixto | Descuento solo sobre líneas elegibles |
| Envío gratis + pickup | Rechazar: “Este cupón es solo para envío a domicilio” |
| Reloj | Servidor UTC + timezone del restaurante |
| Precios | Backend autoritativo; el cliente no manda montos |
| Código | Único por restaurante; comparación sin mayúsculas |

---

## 3. Architecture

```
Owner dashboard  →  CouponService (CRUD)
Live cart        →  POST cart/quote (+ coupon_code)
Live checkout    →  POST menu/{subdomain}/orders (+ coupon_code)
Kitchen confirm  →  OrderService.update_status  →  coupon_redemptions insert
```

```
api (thin)
  → CouponService          # CRUD owner + resolve público
  → CouponPricing          # puro: aplica cupón sobre quote ya promocionado
  → OrderService           # create_public valida y snapshot; confirm redime
  → CouponRepository
```

- `CouponPricing` no importa SQLAlchemy. Tests de dominio sin DB.
- `price_cart` (promos) no cambia de contrato interno: el cupón se aplica **después**.
- Quote y `create_public` usan la misma función `apply_coupon`.

---

## 4. Data model

Alembic siguiente revisión (esperado `0070_coupons` si `0069` es head).

### 4.1 `coupons`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | igual que el resto de entidades |
| `restaurant_id` | UUID FK restaurants CASCADE | |
| `code` | VARCHAR(32) NOT NULL | guardado **uppercase** trimmed |
| `name` | TEXT NOT NULL | etiqueta dashboard |
| `type` | VARCHAR NOT NULL | `amount` \| `percent` \| `free_shipping` |
| `percent` | INTEGER NULL | 1–100 si type = percent |
| `amount_cents` | INTEGER NULL | > 0 si type = amount |
| `scope` | VARCHAR NOT NULL | `all` \| `category` \| `product` |
| `stock_qty` | INTEGER NULL | NULL = ilimitado; si no, ≥ 0 |
| `expires_on` | DATE NULL | NULL = sin caducidad; válido **hasta el fin de ese día** local |
| timestamps + soft delete | | `TimestampMixin` + `SoftDeleteMixin` (`is_active`, `deleted_at`) como `promotions` |

Constraints:

- `type IN ('amount','percent','free_shipping')`
- `scope IN ('all','category','product')`
- percent: `type != 'percent' OR (percent BETWEEN 1 AND 100)`
- amount: `type != 'amount' OR amount_cents > 0`
- free_shipping: percent y amount_cents NULL
- Unique parcial `(restaurant_id, code) WHERE deleted_at IS NULL`

### 4.2 `coupon_products` / `coupon_categories`

Igual patrón que `promotion_products` / `promotion_categories`. PK compuesta. CASCADE. Obligatorias si `scope` es `product` o `category` (al menos un id). `scope = all` no tiene filas puente.

### 4.3 `coupon_redemptions`

| Column | Type |
|--------|------|
| `id` | UUID PK |
| `coupon_id` | UUID FK coupons CASCADE |
| `order_id` | UUID FK orders CASCADE |
| `created_at` | timestamptz |

Unique `order_id` (un pedido redime como máximo un cupón una vez). Confirmar dos veces no inserta dos filas.

### 4.4 `orders` (columnas nuevas)

| Column | Type | Notes |
|--------|------|-------|
| `applied_coupon_id` | UUID NULL FK coupons SET NULL | |
| `applied_coupon_code` | TEXT NULL | snapshot del código |
| `coupon_discount_cents` | INTEGER NOT NULL default 0 | descuento de comida del cupón |
| `coupon_waived_delivery_cents` | INTEGER NOT NULL default 0 | envío original que se puso en 0 |

`applied_order_discounts` JSONB incluye un snapshot extra cuando hay cupón, p. ej. `{ "label": "Cupón PIZZA20", "badge": "PIZZA20", "discount_cents": 4000, "applied": true }`. Para envío gratis: `discount_cents` = `coupon_waived_delivery_cents`.

Los totales de comida (`discount_cents` de orden, `total_cents`) **no se recalculan** al confirmar.

---

## 5. Coupon application (pure)

Input: quote ya promocionado (líneas con `line_total_cents` post-promo), cupón resuelto, `service_type` (`takeout` \| `delivery`), `delivery_fee_cents`, `now_utc`, timezone, `redemption_count`.

### 5.1 Elegibilidad de línea

- `all`: todas las líneas.
- `category`: el producto pertenece a alguna categoría del cupón.
- `product`: `product_id` está en el cupón.

Suma elegible = Σ `line_total_cents` de líneas elegibles (después de promociones). Complementos van en el `line_total` existente; no hay regla extra de complements en v1.

### 5.2 Validación (orden)

Si `coupon_code` viene vacío: no-op.

Si falla, **no se aplica descuento**. Códigos estables + mensaje ES:

| code | Mensaje |
|------|---------|
| `coupon_not_found` | Código no válido |
| `coupon_inactive` | Este cupón no está activo |
| `coupon_expired` | Este cupón expiró |
| `coupon_sold_out` | Este cupón ya no tiene existencias |
| `coupon_not_applicable` | Este cupón no aplica a los productos de tu carrito |
| `coupon_delivery_only` | Este cupón es solo para envío a domicilio |

Reglas:

1. Cupón del restaurante, no soft-deleted, `is_active`.
2. Si `expires_on` no es null: `local_date(now) <= expires_on`.
3. Si `stock_qty` no es null: `redemption_count < stock_qty`. (Solo redenciones de pedidos confirmados.)
4. Al menos una línea elegible. Si no: `coupon_not_applicable`.
5. `free_shipping`: `service_type` debe ser `delivery`. Si es `takeout` o aún no hay servicio: `coupon_delivery_only`.

Caducado o inactivo no se “auto-apaga” en DB. Se evalúa en lectura, como promociones.

### 5.3 Monto

Aplicar **después** de Marketing.

- **percent:** `round(eligible_subtotal_cents * percent / 100)`.
- **amount:** `min(amount_cents, eligible_subtotal_cents)`.
- **free_shipping:** `coupon_discount_cents = 0`; `waived_delivery_cents = delivery_fee_cents`. El servidor pone `delivery_fee_cents = 0` en quote y en el pedido (no se fía del fee que mande el cliente). Si el fee aún es 0 porque no se ha cotizado el envío, el cupón queda aplicado y el siguiente quote con fee real lo anula a 0.

El descuento de comida del cupón es a nivel de **orden** (línea de total aparte). No se reparte a `order_items.discount_cents` en v1 (eso sigue siendo solo promociones).

Total comida = total post-promo − `coupon_discount_cents`. Nunca negativo.

### 5.4 Quote vs create

**POST `/restaurants/{subdomain}/cart/quote`**

Body añade:

- `coupon_code: str | null`
- `service_type: "takeout" | "delivery" | null`
- `delivery_fee_cents: int` default 0

Respuesta añade:

- `coupon: { code, type, discount_cents, waived_delivery_cents } | null`
- `coupon_error: { code, message } | null`
- `total_cents` ya con cupón de comida
- `delivery_fee_cents` (post-cupón; 0 si waived)

Si el código es inválido: líneas y promos igual que hoy; `coupon` null; `coupon_error` lleno. HTTP 200 (el carrito sigue usable). El cliente muestra el error bajo el campo y no marca el cupón como aplicado.

**POST crear pedido**

`PublicOrderInput.coupon_code` opcional.

Si viene código y `apply_coupon` falla: **400** `ValidationError` con el mismo `code`/`message`. **No se crea el pedido** (no se confirma a escondidas a precio lleno). El cliente muestra el error (stock se acabó entre quote y submit, caducó, etc.).

Si aplica: snapshot en columnas + `applied_order_discounts`. **No** inserta `coupon_redemptions`.

---

## 6. Kitchen / Órdenes

Al `pending` → `confirmed` (incluido bulk):

1. Si el pedido tiene `applied_coupon_id`, insertar redención (ignore unique conflict = idempotente).
2. No recalcular precios, promos ni cupón.
3. Inventario de productos sigue igual que hoy.

Cancelar o rechazar: no hay redención (o no se inserta). No hay “devolver” porque nunca se gastó.

### Warning (espejo de inventario)

Pedido `pending` con cupón y `stock_qty` no null y `redemption_count >= stock_qty`:

- Banner: `Cupón {CODE} sin existencias. Puedes confirmar igual.`
- Diálogo de confirmar: mismo tono que inventario (“Puedes confirmar el pedido igual…”) + línea del cupón.
- Se puede combinar con el warning de stock de productos.

Tarjeta del pedido: chip `Cupón PIZZA20 · −$40` o `Cupón ENVIO · Envío gratis`.

Order DTO incluye los campos de cupón para que el front no adivine.

---

## 7. Owner API

Prefijo igual que customers/promotions, auth `require_owned_restaurant`:

- `GET /restaurants/{id}/coupons` — lista cursor; cada item trae `redeemed_count`, `remaining_qty` (`null` si ilimitado; si hay tope, `max(0, stock_qty - redeemed_count)`), `effective_status`. La tabla muestra `redeemed_count / stock_qty` (puede ser `52 / 50` si se confirmaron de más).
- `POST /restaurants/{id}/coupons` — 201
- `PATCH /restaurants/{id}/coupons/{coupon_id}`
- `DELETE /restaurants/{id}/coupons/{coupon_id}` — soft delete

`effective_status`: `active` | `inactive` | `expired` | `sold_out` (prioridad: inactive, expired, sold_out, active). `sold_out` solo si `stock_qty` no es null y remaining = 0.

Validación create/update: código 3–32, `[A-Za-z0-9_-]+`, se guarda uppercase. Nombre no vacío. Scope con ids coherentes.

Editar un cupón no cambia snapshots de pedidos ya creados.

---

## 8. UI

Tokens y CSS modules del dashboard actual. Iconos MUI outlined (`LocalOfferOutlined`), no Phosphor (el panel ya es MUI). No paleta ni fuentes nuevas.

### 8.1 Dashboard `/cupones`

- Ruta: `frontend/src/app/(panel)/cupones/page.tsx` → `CouponsPage`.
- Sidebar entre Marketing y Configuración, label **Cupones**.
- `dashboardSearch`: `page:cupones`, keywords cupones, código, descuento, envío gratis.

Lista tipo Marketing:

- Header + **Agregar cupón**.
- Vacío: “Aún no hay cupones” + CTA.
- Tabla: código (mono, copiar), tipo, beneficio, alcance, existencias (`12 / 50` o `Ilimitado`), caducidad, estado, acciones.
- Cajón crear/editar (mismo patrón que `PromotionForm`): código, nombre, tipo, valor si aplica, alcance (reusar picker de categorías/productos de Marketing), existencias opcional, fecha caducidad opcional, activo.
- Errores: inline `aria-describedby` + resumen `role="alert"` al fallar submit.
- Eliminar: `ConfirmDialog`.

### 8.2 Carrito live menu

En el resumen de checkout (`PublicMenuCheckoutSummary`), bloque:

- Input “Código de cupón” + Aplicar.
- Aplicado: chip con código y botón quitar.
- Error bajo el campo (`role="alert"`).
- Línea de totales: `Cupón PIZZA20 −$40` o `Envío gratis`.

`useCheckoutCartQuote` incluye `coupon_code` y `service_type` / fee de fulfillment en el quote. WhatsApp usa el quote ya con cupón.

Un código a la vez; reemplazar re-cotiza.

---

## 9. Error handling

- Owner CRUD: 404 si el cupón no es del restaurante; 409 si el código está repetido; 400 si el body es inválido.
- Quote público: nunca 400 por cupón malo; `coupon_error` en 200.
- Create public: 400 si mandan código y no aplica.
- Confirm: nunca falla por existencias de cupón.

---

## 10. Testing

Dominio (sin DB):

- percent solo sobre elegibles, encima de promo
- amount no deja el subtotal negativo
- free_shipping pickup → `coupon_delivery_only`
- stock 0 → `coupon_sold_out`
- caducado fin de día local
- código case-insensitive

API/servicio:

- CRUD owner + unique code
- quote aplica / error sin romper promos
- create_public snapshot; 400 si código inválido; **no** crea redención
- confirm inserta redención; segundo confirm no duplica
- cancel no redime

Front:

- `remaining` / status labels
- kitchen warning copy
- quote payload incluye código

---

## 11. Files (expected)

Backend:

- `backend/app/db/models/coupons.py`
- `backend/app/modules/coupons/` (`api`, `service`, `repository`, `adapters`, `schemas`, `pricing.py`)
- `backend/migrations/versions/0070_coupons.py` (o siguiente head)
- `backend/app/modules/public/api.py` + schemas quote
- `backend/app/modules/orders/service.py` + schemas
- `backend/app/api/v1/router.py`
- tests bajo `backend/tests/modules/` y `backend/tests/api/`

Frontend:

- `frontend/src/app/(panel)/cupones/page.tsx`
- `frontend/src/components/pages/CouponsPage.tsx` + CSS module
- `frontend/src/components/coupons/CouponForm.tsx`
- `frontend/src/lib/api/coupons.ts`
- Sidebar, `dashboardSearch`
- checkout summary + `useCheckoutCartQuote` + `buildPublicOrderInput`
- `frontend/src/lib/orders/kitchenCouponWarning.ts`
- `KitchenOrdersView.tsx`

---

## 12. UI notes (ui-ux-pro-max)

Página de dashboard densa, estilo existente (minimal, contraste, focus visible). Empty state con CTA. Validación inline + summary focusable. Sin emoji como icono. `prefers-reduced-motion` en el cajón (Marketing ya anima ~160ms).

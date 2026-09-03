# Envío gratis B2B — fee real al delivery, absorbido por el restaurante

> **Status:** approved — implementation plan ready.  
> **Approach:** 1 — `orders.delivery_fee_cents` = tarifa real; `waived_delivery_cents` = lo que el cliente no paga.  
> **Plan:** `docs/superpowers/plans/2026-09-03-free-shipping-b2b-fee.md`  
> **Scope:** cupones `free_shipping`, promociones `free_shipping` / combo con envío gratis, quote público, crear pedido, dispatch lock de fee, UI cocina/checkout.  
> **Out of scope:** liquidación/facturación automática restaurante↔delivery, cambios de pricing del provider, multi-cupón, backfill histórico opcional más allá de lo necesario para no romper lectura.

---

## 1. Goal

Cuando el cliente tiene **envío gratis** (cupón o promoción), el **restaurante absorbe** el costo. La **empresa de delivery** debe ver y cobrar su tarifa normal. Hoy el pedido guarda `delivery_fee_cents = 0` y el dispatch reutiliza ese 0 → el delivery ve $0.

### Acceptance

1. Cupón envío gratis: el cliente no paga envío; `orders.delivery_fee_cents` = tarifa cotizada real; el panel delivery/dispatch muestra esa tarifa (no $0).
2. Promoción envío gratis (y combo que otorga envío gratis): mismo comportamiento.
3. Cocina/ticket: el cliente ve envío gratis; el restaurante puede ver que absorbe el monto.
4. Pedidos sin envío gratis: sin cambio de comportamiento.
5. Pickup + cupón envío gratis: sigue rechazado.

---

## 2. Confirmed decisions

| Decision | Choice |
|----------|--------|
| Quién paga al delivery | Restaurante absorbe; delivery cobra tarifa normal |
| Qué guarda el pedido | `delivery_fee_cents` = fee real B2B |
| Qué no paga el cliente | Monto en campo waived (ver §3) |
| Total cliente | Comida (con descuentos) **sin** sumar el envío waived |
| Cupón y promo | Misma regla de dinero |
| Dispatch con mismo dropoff | Sigue usando `source_order.delivery_fee_cents` (ya será el fee real) |

---

## 3. Data model

### 3.1 Pedido (`orders`)

| Campo | Significado nuevo |
|-------|-------------------|
| `delivery_fee_cents` | Tarifa real del envío (lo que debe ver/cobrar la empresa delivery). **Nunca** se pone en 0 solo por free shipping. |
| `coupon_waived_delivery_cents` | Hoy solo cupón. Se **generaliza semánticamente** a “envío no cobrado al cliente” también cuando la fuente es promo. |

**Naming (pragmático):**

- **Opción elegida:** mantener el nombre de columna `coupon_waived_delivery_cents` en DB/API por ahora (menos churn), y documentar que también puede llenarse por promoción de envío gratis.
- Alternativa (solo si el rename es barato en el mismo PR): migrar a `waived_delivery_cents`. Preferir rename solo si el diff de tipos/tests es manejable; si no, dejar el nombre legacy y aclararlo en comentarios/DTO.

Reglas:

1. Free shipping activo → `waived = delivery_fee_cents` (mismo monto), `total_cents = food_total` (sin sumar delivery).
2. Sin free shipping → `waived = 0`, `total_cents = food + delivery_fee`.
3. No puede haber waived > delivery_fee.
4. Cupón percent/amount **no** toca `delivery_fee_cents`.

### 3.2 Quote público (`CartQuoteDTO`)

Hoy:

- Promo free shipping: API pone `delivery_fee_input = 0` antes del cupón.
- Cupón free shipping: `apply_coupon` devuelve `delivery_fee_cents=0` + `waived_delivery_cents`.

Nuevo:

| Campo | Valor con free shipping |
|-------|-------------------------|
| `delivery_fee_cents` | Fee real (input del quote de delivery / cliente) |
| `coupon.waived_delivery_cents` | Si la fuente es cupón: fee real |
| Nuevo (recomendado): `waived_delivery_cents` top-level | Fee real si la fuente es promo **o** cupón (fuente de verdad para UI) |
| `total_cents` | Solo comida (como hoy en espíritu: lo que paga el cliente por productos) |

El checkout calcula:

```text
customerDeliveryDue = max(0, delivery_fee_cents - waived_delivery_cents)
customerPay = food_total + customerDeliveryDue
```

---

## 4. Data flow

```text
[Menú live] cotiza delivery → fee real F
        ↓
[cart/quote] promo y/o cupón free shipping
        → delivery_fee_cents = F
        → waived_delivery_cents = F
        → total comida sin F
        ↓
[crear pedido]
        → orders.delivery_fee_cents = F
        → orders.coupon_waived_delivery_cents = F
        → orders.total_cents = comida
        ↓
[dispatch lock same dropoff]
        → quoted_fee_cents = order.delivery_fee_cents (= F)  ✅
[delivery dashboard]
        → muestra quoted_fee_cents (= F)  ✅
```

### 4.1 Backend changes (por archivo)

1. **`coupons/pricing.py` — `apply_coupon` free_shipping**  
   - Dejar de devolver `delivery_fee_cents=0`.  
   - Devolver `delivery_fee_cents` = fee de entrada **y** `waived_delivery_cents` = ese fee.  
   - El caller decide el total cliente = food + (delivery − waived).

2. **`orders/service.py` — create public order**  
   - Tras `apply_coupon`: **no** reemplazar `delivery_fee_cents` por 0.  
   - `order_total = lines_total + max(0, delivery_fee − waived)`.  
   - Persistir fee real + waived.

3. **`public/api.py` — cart/quote**  
   - **No** hacer `delivery_fee_input = 0` cuando hay `applied_free_shipping_promotion_id`.  
   - Si hay promo free shipping: setear `waived_delivery_cents` top-level = fee real (salvo que el cupón también waivee; no doble-contar: waived = fee, no 2×fee).  
   - Respuesta: `delivery_fee_cents` real; `total_cents` comida; waived explícito.

4. **Promos**  
   - `price_cart` sigue solo marcando `applied_free_shipping_promotion_id` (OK).  
   - La zeroización del fee ocurre hoy en `public/api.py` → ahí se corrige.  
   - Al crear pedido: `_build_priced_order` ya corre `price_cart`; debe **devolver** `applied_free_shipping_promotion_id`. Si hay promo free shipping (y tipo delivery), setear waived = fee real aunque no haya cupón. **No confiar** en que el cliente mande fee 0.  
   - Si además hay cupón free shipping, waived sigue siendo una sola vez (= F).

5. **`delivery_dispatch/service.py`**  
   - Sin cambio de lógica si el pedido ya guarda fee real.  
   - Test de regresión: order con waived + delivery_fee > 0 → `quoted_fee_cents == delivery_fee`.

6. **`RequestDeliveryForm.tsx` (cocina → pedir repartidor)**  
   - Hoy prefilla / bloquea tarifa con `sourceOrder.delivery_fee_cents` y el copy habla de “tarifa que vio el cliente”.  
   - Debe usar el fee B2B real (`delivery_fee` o fallback `waived` en históricos) y copy alineado: tarifa del servicio de delivery / costo absorbido por el restaurante, no “lo que pagó el cliente”.

### 4.2 Frontend

1. **Checkout / quote consumers**  
   - No asumir que `quote.delivery_fee_cents === 0` implica free shipping.  
   - Usar `waived_delivery_cents` (top-level o cupón) para mostrar “Envío gratis” y para `customerDeliveryDue`.  
   - `buildPublicOrderInput`: enviar **fee real** en `delivery_fee_cents` (no omitir por ser “gratis”).

2. **Cocina (`orderDisplay` / KitchenOrdersView)**  
   - Fila envío al cliente: `max(0, delivery_fee − waived)` o etiqueta “Envío gratis”.  
   - Si waived > 0: mostrar claramente que el restaurante absorbe (ej. valor en columna de cupón/promo o hint “Absorbe restaurante: $X”).  
   - No mostrar al cliente un envío cobrado + “envío gratis” a la vez sin contexto.

3. **Ticket / WhatsApp**  
   - Cliente: envío gratis / $0 a pagar.  
   - No mentir el costo B2B en mensajes al cliente.

4. **Delivery dashboard**  
   - Sin cambio si `quoted_fee_cents` ya viene bien.

---

## 5. Edge cases

| Caso | Comportamiento |
|------|----------------|
| Promo free shipping + cupón percent | Fee real; waived por promo; cupón descuenta comida |
| Promo free shipping + cupón free shipping | Waived una sola vez (= F); fee real F |
| Fee cotizado 0 (zona gratis real) | waived 0; sin “absorbe” fantasma |
| Pedidos viejos con delivery_fee=0 y coupon_waived>0 | Dispatch: fallback `delivery_fee or coupon_waived` al lockear fee (compat) |
| Re-quote con coords distintas al dispatch | Sigue recalculando quote del provider (comportamiento actual) |

**Compat dispatch (obligatorio en el mismo cambio):**

```text
quoted_fee = order.delivery_fee_cents
if quoted_fee == 0 and order.coupon_waived_delivery_cents > 0:
    quoted_fee = order.coupon_waived_delivery_cents
```

Así pedidos históricos con el bug no siguen mandando $0 al delivery.

---

## 6. Testing

### Backend

- `apply_coupon` free_shipping: `delivery_fee_cents` intacto, `waived_delivery_cents == fee`.
- Create order + cupón free shipping: `delivery_fee > 0`, `waived == fee`, `total == food`.
- Create order + promo free shipping: mismo.
- Cart quote + promo free shipping: `delivery_fee` real, waived set, total comida.
- Dispatch lock same dropoff: `quoted_fee == order.delivery_fee` (y fallback histórico).

### Frontend

- Checkout: customer due delivery = 0 con waived; payload de orden manda fee real.
- `buildOrderTotalsBreakdown`: no trata fee real como cobro al cliente si hay waived.
- WhatsApp/ticket: línea de envío gratis al cliente.

---

## 7. Non-goals

- No cambia cómo el provider calcula su tarifa.
- No crea asiento contable automático “restaurante debe $X a delivery” más allá de `quoted_fee_cents` / fee del pedido.
- No backfill masivo de todos los pedidos históricos (solo fallback en dispatch).

---

## 8. Rollout

1. Backend pricing + order create + quote API.  
2. Dispatch fallback histórico.  
3. Frontend checkout + cocina/ticket.  
4. Tests.  
5. Verificar en delivery dashboard que un pedido nuevo con cupón ENVIOGRATIS muestra tarifa > 0.

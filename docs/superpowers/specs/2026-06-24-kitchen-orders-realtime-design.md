# Kitchen Orders Realtime — Design Spec

**Date:** 2026-06-24  
**Status:** Approved for implementation  
**Scope:** DB snapshots, WebSocket realtime, kitchen UI enrichment, WhatsApp customer notifications on confirm/cancel

---

## 1. Problem

The kitchen view (`/orders`) lists orders but lacks:

- Product images (must survive menu changes after order is placed)
- Real-time updates (currently 30s polling)
- Google Maps link for delivery coordinates
- Per-line applied discount breakdown (like checkout confirm view)
- Customer WhatsApp notification when staff confirms or cancels

---

## 2. Goals

| Goal | Success criteria |
|------|------------------|
| Image snapshot | `order_items.product_image_path` stored at order creation; kitchen renders thumbnail |
| Discount snapshot | `order_items.applied_discounts` JSON array with label, badge, discount_cents, applied |
| Delivery map | `orders.delivery_latitude/longitude` stored; kitchen shows Google Maps link |
| Realtime | WebSocket pushes `order.created` / `order.updated` to restaurant kitchen |
| Confirm → WhatsApp | DB status `confirmed` + new tab with friendly prefilled message to customer |
| Cancel → WhatsApp | DB status `cancelled` + reason picker + prefilled apology message |
| Tests | API integration tests for new fields + WebSocket event on order create |

---

## 3. Non-goals

- Supabase Realtime migration (use native WebSocket + in-process hub; Redis pub/sub later)
- Customer phone capture on web (still `whatsapp` placeholder; prefill opens `wa.me/?text=` when no phone)
- Re-pricing historical orders when promotions change

---

## 4. Data model

### 4.1 Migration `0028_order_kitchen_snapshots`

**`orders`** (new columns):

| Column | Type | Notes |
|--------|------|-------|
| `delivery_latitude` | `DOUBLE PRECISION NULL` | From checkout pin |
| `delivery_longitude` | `DOUBLE PRECISION NULL` | From checkout pin |
| `cancellation_reason` | `TEXT NULL` | Set when status → `cancelled` from kitchen |

**`order_items`** (new columns):

| Column | Type | Notes |
|--------|------|-------|
| `product_image_path` | `TEXT NULL` | Copy of `products.image_path` at order time |
| `applied_discounts` | `JSONB NOT NULL DEFAULT '[]'` | Snapshot array |

**`applied_discounts` item shape:**

```json
{
  "label": "2×1 Hamburguesas",
  "badge": "2×1",
  "discount_cents": 31800,
  "applied": true
}
```

### 4.2 API schema changes

- `PublicOrderInput`: optional `delivery_latitude`, `delivery_longitude` (required pair for delivery)
- `OrderItemCreate` / `OrderItemDTO`: `product_image_path`, `applied_discounts`
- `OrderDTO`: delivery coords, `cancellation_reason`
- `OrderStatusUpdate`: optional `cancellation_reason` (required when `status=cancelled` from kitchen API)

### 4.3 Snapshot rules (server-side at `create_public`)

1. `product_image_path` ← `product.image_path`
2. `applied_discounts` ← built from `price_cart` line: if `discount_cents > 0`, resolve promotion name from `applied_promotion_id`, include `badge`
3. `delivery_latitude/longitude` ← from `PublicOrderInput` when `type=delivery`

---

## 5. Realtime architecture

```
OrderService.create_public / update_status
        │
        ▼
OrderRealtimeHub.publish(restaurant_id, event)
        │
        ▼
WebSocket clients in room `restaurant:{id}:orders`
```

**Endpoint:** `WS /api/v1/ws/restaurants/{restaurant_id}/orders?token={jwt}`

**Auth:** Verify Supabase JWT; ensure `restaurant.owner_id == user.id`.

**Events:**

```json
{ "type": "order.created", "order": { ...OrderDTO } }
{ "type": "order.updated", "order": { ...OrderDTO } }
```

**Hub:** In-process `OrderRealtimeHub` with `asyncio.Queue` bridge from sync `OrderService` (thread-safe `call_soon_threadsafe`). Single-instance dev sufficient; interface allows Redis pub/sub later.

**Frontend:** `useKitchenOrdersSocket` — connect on `/orders`, merge events into order list, remove 30s polling (keep manual refresh + reconnect).

---

## 6. Kitchen UI

### 6.1 Order line card

- Thumbnail from `product_image_path` via `storagePublicUrl`
- Quantity + name (large)
- Options resolved from menu catalog (fallback UUIDs)
- **Applied discounts** list: label, badge, −amount

### 6.2 Delivery block

- Full address (existing)
- **Google Maps** button linking to `buildGoogleMapsDeliveryUrl` equivalent from stored lat/lng or address fallback

### 6.3 Confirm action

1. `POST .../status` `{ status: "confirmed" }`
2. Open new tab: WhatsApp prefilled message (emojis allowed in message body):

```
¡Hola {name}! 👋
Tu pedido #{ref} fue *aceptado* y ya lo estamos preparando. 🍳
¡Gracias por tu preferencia!
```

### 6.4 Cancel action

1. Modal with preset reasons (touch-friendly chips, min 44px):
   - Producto agotado
   - Fuera de zona de entrega
   - Restaurante cerrado
   - No podemos prepararlo a tiempo
   - Datos incorrectos en el pedido
   - Otro motivo
2. `POST .../status` `{ status: "cancelled", cancellation_reason: "..." }`
3. WhatsApp prefilled:

```
Hola {name}, lamentamos informarte que tu pedido #{ref} no pudo ser aceptado. 😔
Motivo: {reason}
Si tienes dudas, escríbenos por aquí. ¡Gracias por tu comprensión!
```

**Phone:** If `customer_phone !== "whatsapp"`, use `wa.me/{phone}?text=`. Else `wa.me/?text=` (staff picks customer's chat).

---

## 7. Testing

| Test | File |
|------|------|
| Order persists image_path, discounts, delivery coords | `test_public_live_menu_order.py` |
| Cancel stores cancellation_reason | `test_order_kitchen_status.py` |
| WebSocket receives order.created | `test_orders_websocket.py` |

---

## 8. Files

| Area | Files |
|------|-------|
| Migration | `migrations/versions/0028_order_kitchen_snapshots.py` |
| Models | `app/db/models/orders.py` |
| Schemas | `app/modules/orders/schemas.py` |
| Service | `app/modules/orders/service.py` |
| Realtime | `app/infra/realtime/order_hub.py`, `app/modules/orders/ws.py` |
| Main | `app/main.py` (lifespan) |
| Frontend API | `lib/api/types.ts`, `lib/api/orders.ts`, `buildPublicOrderInput.ts` |
| Frontend kitchen | `KitchenOrdersView.tsx`, `OrdersKitchen.module.css`, `useKitchenOrdersSocket.ts`, `kitchenWhatsApp.ts`, `OrderCancelDialog.tsx` |

---

## 9. Rollout

1. Run migration
2. Deploy backend (WebSocket + new fields)
3. Deploy frontend (socket + UI)
4. Existing orders: nullable new fields; kitchen shows placeholder image / no discounts

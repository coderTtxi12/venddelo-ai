# Inventario en el menú digital

Qué hace `feat/inventory` en el **menú live / menú digital** de los negocios. El inventario es **opt-in**: si el restaurante no lo activa, el menú público no cambia.

> **Fuente del menú público:** `GET /public/menu/{subdomain}` → `FullMenuDTO`  
> **Sanitización:** `sanitize_public_menu()` en `backend/app/infra/cache/menu_cache.py`  
> **Reglas:** `backend/app/modules/menu/inventory.py`  
> **UI:** `frontend/src/components/digital-menu/menuProductUi.tsx`

Este documento describe el inventario del menú digital. La implementación vive en el working tree actual (sin merge de `feat/inventory`).

---

## 1. Idea

El negocio puede llevar stock opcional por producto (una **tanda**). Eso se traduce en tres cosas, **solo** si el dueño enciende el toggle:

1. **El stock baja** cuando cocina acepta un pedido.
2. **Stock bajo** → badge de urgencia en el menú live, **sin decir cuántas piezas quedan**.
3. **Stock 0** → el producto pasa a `inactive` y el cliente ve **No disponible** (el estado que ya existía).

La cantidad exacta, la caducidad de la tanda y las fechas de lote **nunca** salen al menú público.

---

## 2. Cómo lo activa el negocio

En el dashboard, página **Productos** (no en el editor del menú digital):

| Control | Campo | Default |
|---------|--------|---------|
| Toggle **Reflejar inventario en menú live** | `restaurants.live_menu_inventory_enabled` | `false` |
| **Pocas piezas a partir de** (siempre visible; solo aplica en el menú si el toggle está on) | `restaurants.low_stock_threshold` | `3` |

El stock se carga por producto (`inventory_qty`). Vacío / `null` = ese producto **no** trackea inventario: pedidos y menú se comportan como hoy.

Cambiar el toggle o el umbral **invalida el cache** del menú público para que el badge aparezca o desaparezca de inmediato.

---

## 3. Qué ve el cliente

Solo con `live_menu_inventory_enabled = true` y producto `status == active`.

| Condición | Menú digital |
|-----------|----------------|
| Producto `inactive` (incluye agotado por inventario) | Badge existente **No disponible**; no se puede agregar al carrito |
| `show_low_stock == true` | Badge **¡Date prisa! Quedan pocas** (sin número) |
| Resto | Sin cambio |

El badge se pinta en:

- tarjetas de producto (móvil y layout compartido) — `ProductCardContent`
- lista desktop — `PublicDesktopMenuLayout`
- `aria-label` de la tarjeta: `Ver {nombre}, ¡Date prisa! Quedan pocas`

Estilo: `.productLowStockBadge` en `DigitalMenuPage.module.css`, con tokens `--dm-low-stock-*` para que el tema del menú lo pueda teñir.

El detalle del producto **no** muestra cantidad, caducidad ni “vence hoy”. Si el backend rechaza el pedido por stock insuficiente, el checkout muestra el error de validación; el carrito sigue gated por `status == active`.

---

## 4. Contrato público (qué sí y qué no viaja)

Cada producto del menú público puede traer `show_low_stock`. El backend **recalcula** ese flag en cada respuesta (cache hit o miss) y **anula** los campos sensibles:

| Campo | Dueño (API de productos) | Menú público |
|-------|--------------------------|--------------|
| `show_low_stock` | — | `true` / `false` según reglas de abajo |
| `inventory_qty` | cantidad real o `null` | siempre `null` |
| `shelf_life_days` | opcional | siempre `null` |
| `expires_on` | opcional | siempre `null` |
| `batch_started_at` | inicio de tanda | siempre `null` |

La cache guarda el menú **crudo** (con qty). `get_public_menu` / menú traducido llaman `sanitize_public_menu()` **al leer**, para que un cambio de umbral o de toggle no dependa de entradas viejas.

`show_low_stock` es `true` solo si **todas** estas son ciertas:

1. `live_menu_inventory_enabled`
2. `status == "active"`
3. `inventory_qty` no es `null`
4. `0 < inventory_qty <= low_stock_threshold`

Si el toggle está off, el badge no sale aunque el producto tenga stock bajo.

---

## 5. Pedidos y el menú live

El pedido público se crea en `pending` **sin** restar stock. El inventario se consume **solo** si el toggle live está on **y** cocina acepta el pedido en `/ordenes` (`pending` → `confirmed`):

1. Se agrupa la cantidad por `product_id` (se ignoran líneas sin producto).
2. Se consume inventario en orden **determinista** (IDs ordenados) con `SELECT … FOR UPDATE` y `populate_existing=True`.
3. Solo se resta si `inventory_qty IS NOT NULL`. Si no hay inventario en ese producto, no se toca.
4. Si no alcanza el stock, cocina ve un **aviso** antes de confirmar. Confirmar **no** falla: se resta lo que hay y el producto queda en 0.
5. Si tras restar queda `0` → `status = inactive` → en el menú pasa a **No disponible**.
6. Si el toggle está off, **no** se resta stock y el menú público no cambia.
7. Si se consumió stock, se invalida el cache del menú (todos los locales).

Cancelar un pedido (antes o después de confirmar) en v1 **no** repone stock.

---

## 6. Relación con la tanda (solo dueño)

Esto **no** se ve en el menú digital; alimenta el stock que el menú usa.

- Reponer o subir `inventory_qty` reinicia `batch_started_at` (nueva tanda) y, con toggle on, puede reactivar un producto `inactive`.
- Reescribir la misma cantidad (un PATCH de nombre/precio) **no** reinicia la tanda.
- Poner qty en `0` (al editar el producto) y, con toggle on, deja el producto `inactive`.
- Caducidad (`shelf_life_days` / `expires_on`) es indicador de dashboard. **No** auto-inactiva el producto y **no** llega al cliente.

---

## 7. Archivos tocados (menú digital)

| Área | Archivos |
|------|----------|
| Badge y copy | `frontend/src/components/digital-menu/menuProductUi.tsx` |
| Layout desktop | `frontend/src/components/digital-menu/PublicDesktopMenuLayout.tsx` |
| Estilos | `frontend/src/components/pages/DigitalMenuPage.module.css` |
| Tipo público | `frontend/src/lib/api/types.ts` (`show_low_stock`) |
| Sanitizar + cache | `backend/app/infra/cache/menu_cache.py`, `translated_menu.py` |
| Consumo al confirmar | `backend/app/modules/orders/service.py` (`pending` → `confirmed`) |
| Invalidar cache al cambiar toggle | `backend/app/modules/restaurants/api.py` |
| Invalidar cache al aceptar en Órdenes | `backend/app/modules/orders/api.py` (`inventory_changed`) |

El toggle y los campos de tanda viven en el dashboard Productos (`ProductsInventoryLiveToggle`, `ProductInventoryControls`); no forman parte de la UI pública del menú.

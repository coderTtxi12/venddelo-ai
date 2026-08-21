# Confirmar pedido a domicilio: drawer para solicitar repartidor

> **Estado:** pendiente de revisión del usuario antes del plan de implementación.
> **Fecha:** 2026-08-20
> **Apps:** `frontend/` (`/orders`, `/delivery`)

## 1. Objetivo

En el dashboard del restaurant owner, un pedido **nuevo** (`pending`) de tipo **entrega a domicilio** no debe confirmarse a ciegas. Al pulsar **Confirmar**, se abre el mismo formulario de **Solicitar delivery** con los datos del pedido ya llenos. Un solo botón confirma el pedido y solicita el repartidor (`createDispatchRequest`), igual que en `/delivery`.

Tras un envío creado, el panel muestra el mismo aviso de éxito de `/delivery` (copiar rastreo, WhatsApp, abrir enlace).

## 2. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Cuándo aplica | Solo `status === 'pending'` y `type === 'delivery'` |
| Recoger / para llevar | **Confirmar** sigue pasando a `confirmed` al instante. Sin drawer |
| Click en Confirmar | Solo abre el drawer. El pedido **no** cambia de estado todavía |
| Confirmar + rider | Mismo botón. Primero `createDispatchRequest`, luego `pending` → `confirmed` |
| Copy del botón (cocina) | Continuar y solicitar repartidor |
| Copy del botón (`/delivery`) | Solicitar repartidor (sin cambio) |
| UI | Drawer derecho con backdrop, no modal centrado, no navegar a `/delivery` |
| Desktop | Panel 640px (máx 92vw) anclado a la derecha |
| Celular | Casi o 100% del ancho del viewport, por encima del overlay de detalle |
| Cerrar sin enviar | X, backdrop o Escape. El pedido permanece `pending` |
| Tras éxito | El drawer se queda abierto y muestra el bloque de éxito de `/delivery` |
| Autollenado | Nombre, teléfono, dirección + coords, referencias si vienen en la nota de dirección, pago, monto restaurante, billete |
| Defaults | Paquete normal, 1 paquete, primer “listo en” del restaurante. Maps URL y notas al rider vacíos |
| Courier / zona | Mismos bloqueos y avisos que `/delivery`. Sin atajo para confirmar domicilio sin rider |
| Backend | Sin FK pedido ↔ dispatch. Mismo POST de `/delivery` |
| WhatsApp al confirmar | No se abre al confirmar (ya quitado). WhatsApp del **éxito** sí, para compartir rastreo |

## 3. Fuera de alcance

- Ligar `dispatch_requests` a `orders.id`.
- Confirmar un domicilio sin solicitar repartidor.
- Cambiar el contrato de `POST /restaurants/me/dispatch-requests`.
- Mostrar el drawer en Confirmados / Preparando / Listos.
- Paleta o tipografía nuevas.

## 4. Estado actual

| Pieza | Hoy |
|---|---|
| Cocina | `KitchenOrdersView`: **Confirmar** llama `updateRestaurantOrderStatus` → `confirmed` |
| Formulario Delivery | Inline en `DeliveryPage` (no es componente reutilizable) |
| Crear envío | `createDispatchRequest` → `POST /restaurants/me/dispatch-requests` |
| Pedido domicilio | Trae `customer_name`, `customer_phone`, `payment_method`, `delivery_address`, lat/lng, `delivery_fee_cents`, `cash_denomination_cents`, `total_cents` |
| Dirección checkout | `formatDeliveryAddressForOrder`: calle; si hay detalles, `\nReferencias: …` |
| Drawer similar | `MarketingPage` (backdrop + panel derecho) |

## 5. Arquitectura

```
/orders  (KitchenOrdersView)
  Confirmar (pending + delivery)
    → OrderDispatchDrawer (derecha)
         RequestDeliveryForm  ← mismo que /delivery
           initialValues desde Order
           submit:
             1. createDispatchRequest
             2. updateRestaurantOrderStatus(confirmed)
             3. mostrar DispatchRequestSuccess
  Confirmar (pending + takeout)
    → confirmed, sin drawer

/delivery  (DeliveryPage)
  RequestDeliveryForm (sin initialValues de pedido)
  DispatchRequestSuccess (si acaba de crear)
```

Extraer de `DeliveryPage`:

1. **`RequestDeliveryForm`** — campos, cotización, validación, submit a `createDispatchRequest`.
2. **`DispatchRequestSuccess`** — copiar rastreo, WhatsApp, abrir enlace.
3. **`orderToDispatchFormValues(order)`** — mapper puro pedido → valores iniciales.
4. **`OrderDispatchDrawer`** — shell (backdrop + panel) + form + éxito + confirmar pedido.

`DeliveryPage` conserva header, live, lista de solicitudes y el collapsible; deja de dueñar el markup del formulario.

## 6. Flujo de datos

### 6.1 Apertura

`handleAdvance`:

- Si `nextStatus !== 'confirmed'` → comportamiento actual (Preparar, Marcar listo, Entregado).
- Si `nextStatus === 'confirmed'` y `type !== 'delivery'` → `patchOrder(confirmed)`.
- Si `nextStatus === 'confirmed'` y `type === 'delivery'` → abrir drawer con ese `Order`. No llamar API todavía.

### 6.2 Autollenado

| Campo formulario | Origen |
|---|---|
| Nombre | `order.customer_name` |
| Celular | `parseE164Phone(order.customer_phone)` |
| Dirección + lat/lng | `order.delivery_address`, `delivery_latitude`, `delivery_longitude` |
| Referencias | Si la dirección contiene `\nReferencias:`, partir calle vs referencias |
| Forma de pago | `order.payment_method` |
| Monto restaurante | `buildOrderTotalsBreakdown(order).restaurantSubtotalCents` (pesos). No incluye envío |
| ¿Con cuánto paga? | `order.cash_denomination_cents` si efectivo |
| Tamaño / nº paquetes | `normal` / `1` |
| Listo en | primer lead time del restaurante (igual que Delivery) |
| Maps URL | vacío |
| Notas al rider | vacío |

El usuario puede editar cualquier campo antes de enviar.

La cotización usa lat/lng del pedido (`usePublicDeliveryQuote`), igual que `/delivery`.

### 6.3 Submit (botón único)

1. Validar como en Delivery (`canRequestRider`, nombre, teléfono, efectivo/denominación).
2. `createDispatchRequest(...)` con el mismo body que `/delivery`.
3. Si el POST falla → error en el drawer. Pedido sigue `pending`. No llamar confirmar.
4. Si el POST ok → `updateRestaurantOrderStatus(..., 'confirmed')` y `replaceOrder`.
5. Pintar `DispatchRequestSuccess` con `tracking_token` y subdominio (mismo URL que Delivery: `{origin}/rastreo/{token}`).
6. Si el POST ok y confirmar falla → dejar visible el éxito del envío y un aviso para **reintentar solo** el cambio a `confirmed`. No volver a crear el dispatch.

Props del form: `submitLabel` (`Continuar y solicitar repartidor` vs `Solicitar repartidor`) y `onCreated(request)` para que cocina encadene el confirm.

## 7. UI

- Backdrop `position: fixed; inset: 0`; panel `justify-content: flex-end` (patrón Marketing).
- Desktop: `width: min(640px, 92vw)`, `height: 100%`, scroll en el body.
- Celular (`max-width: 900px`, el mismo corte que cocina usa `min-width: 901px`): panel `width: 100%`. `z-index` por encima del overlay de detalle móvil.
- Header del drawer: título (p. ej. Solicitar delivery + `#` del pedido), botón cerrar.
- Formulario: mismos campos, estilos y avisos (cobertura, clima, courier) que `/delivery`.
- Éxito: extraer el bloque `success` de `DeliveryPage` (copiar, WhatsApp, abrir rastreo). Cerrar el drawer después es opcional; no navega a `/delivery`.
- `prefers-reduced-motion`: sin slide o slide ~0.

## 8. Errores

| Caso | Comportamiento |
|---|---|
| POST dispatch falla | Mensaje de Delivery. Pedido `pending` |
| POST ok, PATCH pedido falla | Éxito de rastreo + error + reintentar confirmar |
| Courier no disponible | Alert de Delivery. Botón deshabilitado |
| Fuera de zona / cotización pendiente | Igual que Delivery. Botón deshabilitado |
| Dirección sin coords | El picker queda editable; no se puede enviar hasta cotizar |

## 9. Pruebas

- `orderToDispatchFormValues`: parte `Referencias:`, montos sin fee de envío, teléfono E.164, efectivo vs transferencia.
- Cocina: `pending` + `delivery` abre drawer y no llama PATCH; `pending` + `takeout` sí confirma.
- Submit: si `createDispatchRequest` rechaza, no se llama `updateRestaurantOrderStatus`.
- Submit ok: se llama create y después confirm, en ese orden.

## 10. Criterio de hecho

- Pedido nuevo a domicilio: Confirmar abre drawer prellenado; un clic solicita rider y confirma.
- Pedido nuevo para llevar: Confirmar no abre drawer.
- Cerrar el drawer sin enviar no cambia el pedido.
- `/delivery` sigue pidiendo rider con el mismo componente y el mismo POST.
- Tras éxito en cocina se puede copiar / WhatsApp / abrir el rastreo sin salir de `/orders`.

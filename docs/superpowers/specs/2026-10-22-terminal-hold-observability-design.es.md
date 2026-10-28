# Retención de terminal (observabilidad)

> **Fecha:** 2026-10-22  
> **Apps:** `backend/`, `frontend/` (dashboard restaurante, `/delivery`), `apps/rider/`, `delivery-dashboard/` (`/monitor`)

## 1. Objetivo

Cuando un pedido se cobra con terminal (`card_terminal`), el restaurante presta la terminal física al rider. Hoy nadie registra quién la tiene. Si no vuelve —o vuelve al día siguiente— un reclamo no tiene a quién señalar.

La función es **observabilidad de posesión**: saber qué rider tiene la terminal de qué restaurante, aunque el pedido ya esté entregado o cancelado.

## 2. Por qué

El crédito ya resuelve “el rider todavía no me entregó el efectivo”. La terminal es el mismo gesto con un objeto físico, no con dinero. El restaurante es quien ve la devolución. Operaciones solo necesita la lista para contestar el reclamo.

## 3. Metas

- En todo pedido `card_terminal` (menú digital o solicitud manual), al **recoger** se crea una retención de terminal al rider que recogió.
- El restaurante libera en su dashboard Delivery, igual que libera crédito.
- El rider ve que tiene terminal retenida.
- El monitor de Mexy lista restaurante–repa de cada terminal retenida, aunque el pedido esté cerrado.
- Un pedido = una retención.

## 4. No-metas

- No bloquea ofertas, asignación ni cupo del rider.
- No se libera solo al entregar, cancelar o reasignar.
- Operaciones **no** puede liberar desde el monitor.
- No se mezclan retenciones de terminal con `delivery_credit_holds` ni con `credit_held_cents`.
- No hay backfill de recogidas anteriores al deploy.
- No hay push FCM obligatorio; basta la UI y el realtime que ya usa rider/restaurante/monitor.
- No se toca Mexy app ni el menú público.

## 5. Anti-metas

Falla aunque “funcione” si:

- entregar o cancelar suelta la retención (el reclamo típico llega después),
- un cambio de rider mueve la retención al nuevo (la terminal se la llevó el que recogió),
- el motor deja de ofertar al rider porque “tiene terminal”,
- el monitor trata la terminal como crédito (monto, liberar comisión).

## 6. Decisiones

| Tema | Decisión |
|---|---|
| Quién libera | Solo el restaurante |
| Dónde libera | Dashboard restaurante, página Delivery |
| Cuándo nace | Transición a `picked_up` si `payment_method == card_terminal` |
| Cuándo muere | `POST` de liberación del restaurante |
| Tras entrega / cancel / reasignar | Sigue `held` en el rider que recogió |
| Bloqueo | Ninguno |
| Modelo | Tabla nueva `delivery_terminal_holds`, no un `kind` de crédito |
| Superficies | Restaurante + rider + monitor. Backend es la fuente de verdad |

## 7. Flujo

```
asignado (sin retención)
    → rider marca recogido en pedido card_terminal
    → hold created (driver = quien recogió)
    → rider cobra al cliente, entrega, o el pedido se cancela / se reasigna
    → hold sigue held
    → restaurante pulsa Liberar terminal
    → hold released
```

Antes de recoger no hay retención: la terminal sigue en el local.

Si se reasigna **antes** de recoger, no hay hold. El que recoja después es el titular.

Si se reasigna **después** de recoger, el hold **no se transfiere**. El `assigned_driver_id` puede cambiar; `delivery_terminal_holds.driver_id` no. Una segunda recogida del nuevo rider no crea otro hold ni pisa el `driver_id` (hay como máximo una fila por `request_id`). El restaurante **sí puede liberar** en ese estado: la regla es “hay hold `held`”, no el status del pedido.

## 8. Datos

Tabla `delivery_terminal_holds`:

| Columna | Notas |
|---|---|
| `id` | UUID |
| `request_id` | FK `delivery_dispatch_requests`, **unique** |
| `driver_id` | FK `delivery_drivers` — rider que recogió; no se actualiza al reasignar |
| `status` | `held` \| `released` |
| `held_at` | momento de la recogida |
| `released_at` | null mientras `held` |
| `released_by_user_id` | usuario del restaurante que liberó; SET NULL |
| timestamps | mixins del proyecto |

Índice: `(driver_id, status)` y `(status)` para listar holds activos del rider y del monitor.

No hay `amount_cents`. No hay `kind`.

Crear en `transition_assignment(..., "picked_up")` cuando el método es `card_terminal` y no existe fila. Idempotente.

Liberar no toca `credit_held_cents` ni el motor de asignación.

## 9. API

Campos nuevos en `DispatchRequestDTO` (lista restaurante y realtime):

- `terminal_hold_status`: `"held"` \| `"released"` \| `null`
- `terminal_holder`: `{ driver_id, first_name, photo_url } \| null` — el que **tiene** la terminal, no el asignado actual

`RiderProfileDTO` y eventos rider:

- `terminal_holds`: lista de holds `held` de ese driver  
  `{ request_id, short_id, restaurant_name, restaurant_id, held_at }`

Historial rider (`RiderHistoryPageDTO`):

- `active_terminal_holds`: la misma lista (el historial ya carga holds de crédito así)

Monitor snapshot:

- `terminal_holds`: `[{ id, request_id, short_id, driver_id, driver_name, restaurant_id, restaurant_name, customer_name, held_at, request_status }]`
- `metrics.terminal_holds_active`: count

Endpoint nuevo, solo restaurante dueño del request:

`POST /api/v1/restaurants/me/dispatch-requests/{request_id}/confirm-terminal-return`

- 200 + `DispatchRequestDTO` si el hold estaba `held`
- 400 si no hay hold `held`
- El status del pedido no importa: si hay hold `held` (incluido `assigned` tras reasignar), se puede liberar
- No existe endpoint equivalente en delivery-provider

Realtime: el mismo `dispatch.updated` del restaurante y el snapshot/eventos del monitor y rider que ya existen. Al crear o liberar, notificar esas tres superficies. El builder elige el campo extra en el payload rider (`terminal_holds` o un invalidate + refetch); no debe depender de `credit_held_cents`.

## 10. UI

### Restaurante — `/delivery` (`frontend`)

Panel gemelo a `DispatchRiderCreditPanel`, encima o debajo, mismo layout:

- Título: **Terminal retenida**
- Subtítulo: `Riders que todavía tienen tu terminal.`
- Agrupa por `terminal_holder`, no por `assigned_driver`
- Fila: short id, cliente, **Liberar terminal**
- Confirmación en dos pasos, copy:

  1. `¿Ya te devolvió la terminal?` / `Esto quita la retención al repartidor. Confírmalo solo si ya tienes la terminal en tu negocio.`
  2. `Vas a marcar que {nombre} ya te entregó la terminal de {short_id}.`

En `DispatchRecentRequests`, botón **Liberar terminal** en la fila cuando `terminal_hold_status === 'held'`, también en historial.

El panel sigue visible si el pedido está entregado o cancelado.

### Rider (`apps/rider`)

Chip en home, junto al de crédito, **solo si hay holds**:

- 1: `Terminal retenida`
- n: `{n} terminales retenidas`

En historial, bloque **Terminales retenidas** (restaurante + short id), paralelo a “Holds activos” de crédito.

No hay acción de liberar en rider.

### Monitor (`delivery-dashboard` `/monitor`)

Métrica **Terminales retenidas** + panel lista:

`{rider} · {restaurante} · {short_id}`  
meta: cliente · estado del pedido (incluido entregado/cancelado)

Sin botón de liberar. No mezclar con el panel **Crédito retenido**.

## 11. Copy fijo

| Superficie | Texto |
|---|---|
| Panel restaurante | Terminal retenida |
| Botón | Liberar terminal |
| Chip rider (1) | Terminal retenida |
| Chip rider (n) | `{n} terminales retenidas` |
| Monitor panel / métrica | Terminales retenidas |
| Vacío monitor | Sin terminales retenidas. |

## 12. Qué queda al builder

- Número de migración (siguiente al head actual).
- Reusar CSS del panel de crédito vs archivo nuevo.
- Forma exacta del evento realtime rider, mientras el chip y el historial se actualicen sin pull to refresh.
- Tests: crear en pickup `card_terminal`; no crear en cash/transfer ni en assign; no transferir al reasignar; no soltar al entregar/cancelar; liberar con pedido `assigned` tras reasignar post-pickup; solo el restaurante libera; monitor lista holds de pedidos cerrados; motor sigue ofertando al rider con hold.

## 13. Éxito

Llega un reclamo. Operaciones abre el monitor, ve restaurante y rider, y puede decir quién tiene la terminal. El restaurante la marca al recibirla. El rider la ve en la app hasta entonces. El pedido puede llevar horas o un día cerrado.

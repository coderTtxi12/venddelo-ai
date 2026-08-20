# /delivery del owner: SSE en lugar de WebSocket + arreglo al solicitar

> **Estado:** pendiente de revisión del usuario antes del plan de implementación.
> **Fecha:** 2026-08-20
> **Apps:** `frontend/` (`/delivery`), `backend/` (hub + ruta realtime del restaurante)

## 1. Objetivo

Dos fallos en la misma pantalla:

1. **Solicitar repartidor** muestra “No se pudo solicitar el delivery.” aunque el POST puede haber creado el envío.
2. El live de la lista usa un **WebSocket** al backend que ocupa un slot de Cloud Run todo el tiempo que `/delivery` está montado, incluso con la pestaña oculta.

El live es **solo lectura**. Sustituir el WS por **SSE HTTP**, abierto **solo mientras la pestaña está visible**. El POST de crear no cambia de contrato.

## 2. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Transporte live | SSE (`text/event-stream`), no WebSocket, no Supabase Realtime, no Redis |
| Cuándo abre | `document.visibilityState === 'visible'` y hay `restaurantId` + token |
| Cuándo cierra | pestaña oculta, unmount, o tope de duración del stream |
| Auth SSE | header `Authorization: Bearer` (como el chat). No token en query |
| Fan-out | Hub **in-memory** del proceso (igual que hoy). No Redis |
| Evento | `dispatch.updated`; el cliente vuelve a `GET` la lista. Payload sin DTO |
| Poll | 20 s **solo** si visible y el SSE no está `live`. Cero poll con pestaña oculta |
| Timeout Cloud Run | el cliente aborta y reconecta a los **240 s**. Heartbeat servidor cada **15 s** |
| Monitor / rider / cocina | sin cambios (siguen WebSocket) |
| UI | misma página, mismo indicador En vivo / Conectando / Reconectando / Sin enlace |

## 3. Fuera de alcance

- Redis pub/sub ni backplane multi-instancia.
- Mover monitor, rider o kitchen a SSE.
- Subir timeout/concurrency de Cloud Run.
- Cambiar el POST/GET/PATCH de `dispatch-requests`.
- Paleta, copy de estados, o layout nuevo.

## 4. Causa del error al solicitar

En `DeliveryPage.submit`, después de `await createDispatchRequest(...)` se llama `event.currentTarget.reset()`.

Tras un `await`, React deja `event.currentTarget` en `null`. Eso lanza `TypeError`, el `catch` no es `ApiError`, y se pinta el mensaje genérico. El envío puede existir ya en el backend.

**Arreglo:** no usar `currentTarget` después del `await`. `notes` pasa a estado controlado (como el resto del form). Tras un 201 se limpia con `setState`, no con `form.reset()`.

## 5. Estado actual

| Pieza | Hoy |
|---|---|
| Página | `frontend/src/components/pages/DeliveryPage.tsx` |
| Crear | `POST /restaurants/me/dispatch-requests` |
| Lista | `GET /restaurants/me/dispatch-requests` |
| Live | `useRestaurantDispatchSocket` → `WS /ws/restaurants/{id}/dispatch?token=` |
| Hub | `RestaurantDispatchRealtimeHub` con `set[WebSocket]` |
| Publish | `notify_request_realtime` → `publish_sync(..., {"type": "dispatch.updated"})` |
| Fallback | poll 20 s si el socket no está `live` (también con pestaña oculta) |

## 6. Arquitectura

```
Owner en /delivery
  │
  ├─ REST create/list/cancel/retry/cash  (igual)
  │
  └─ si visible && restaurantId && token
       GET /restaurants/{id}/dispatch/events
         Authorization: Bearer
         Accept: text/event-stream
       event dispatch.updated → GET lista
       : ping cada 15 s
       abort a los 240 s o al hidden → Cloud Run suelta el request
```

El POST de crear sigue llamando `notify_request_realtime`. El hub entrega el mismo dict a colas SSE en lugar de a sockets.

## 7. Backend

### 7.1 Hub

Archivo: `backend/app/infra/realtime/restaurant_dispatch_hub.py`.

Sustituir `set[WebSocket]` por `set[asyncio.Queue[dict]]`.

- `subscribe(restaurant_id) -> Queue` con `maxsize=8`.
- `unsubscribe(restaurant_id, queue)`.
- `publish_sync` **no cambia de firma**. Sigue usándose desde threads sync de SQLAlchemy vía `call_soon_threadsafe`.
- Si una cola está llena: descartar el evento más viejo y meter el nuevo. Un `UPDATE` de dispatch **nunca** falla porque el SSE esté caído.
- `bind_loop` / `shutdown` se quedan (el lifespan de `main.py` no cambia).

No enviar JSON por WebSocket. El endpoint SSE lee la cola.

### 7.2 Endpoint

Quitar:

```
WS /api/v1/ws/restaurants/{restaurant_id}/dispatch
```

Añadir en `backend/app/modules/delivery_dispatch/ws.py`:

```
GET /api/v1/restaurants/{restaurant_id}/dispatch/events
```

- Auth: `get_current_user` (Bearer) y **un `SqlAlchemyUnitOfWork` corto** para owner/admin, igual que el WS actual. 401 sin Bearer, 403 sin acceso, 404 si el restaurante no existe.
- **No** usar `Depends(get_uow)` ni `require_owned_restaurant` en el endpoint: esa sesión se quedaría abierta los 240 s y agotaría el pool. El UoW se cierra **antes** de empezar a hacer yield.
- `StreamingResponse` `text/event-stream`.
- Headers: `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
- Generador:
  1. `queue = hub.subscribe(restaurant_id)`
  2. loop: `await asyncio.wait_for(queue.get(), timeout=15)`
     - evento → `event: dispatch.updated\ndata: {"type":"dispatch.updated"}\n\n`
     - timeout → comentario SSE `: ping\n\n`
  3. `finally: hub.unsubscribe(...)`

Formato alineado con `AssistantAgentService.format_sse`.

El servidor **no** corta el stream a los 240 s: el cliente aborta. Si Cloud Run cierra a los 300 s, el cliente reconecta con backoff.

### 7.3 Publish

`notify_request_realtime` no cambia el payload. Solo deja de depender de sockets.

## 8. Frontend

### 8.1 Helpers puros

`frontend/src/lib/dispatch/restaurantDispatchSse.ts`

```ts
export function shouldOpenRestaurantDispatchSse(input: {
  restaurantId: string | null;
  accessToken: string | null;
  visibilityState: DocumentVisibilityState;
}): boolean

export function parseRestaurantDispatchSseBlock(
  block: string,
): { type: 'dispatch.updated' } | null
```

`shouldOpen` es `true` solo si los tres están presentes y `visibilityState === 'visible'`. El parser ignora `: ping` y bloques que no sean `dispatch.updated`.

### 8.2 Stream

`frontend/src/lib/dispatch/streamRestaurantDispatchEvents.ts`

`fetch` GET con `Accept: text/event-stream` y `Authorization: Bearer`, `AbortSignal`. Parser de bloques SSE (mismo estilo que `parseSseBlock` del assistant). Ignorar comentarios (`:`). En `dispatch.updated` llamar `onEvent`. Abort no es error (`isFetchAbortError`).

No usar `EventSource`: no admite header Authorization.

### 8.3 Hook

Reemplazar `useRestaurantDispatchSocket` por `useRestaurantDispatchEvents`.

Estados: `connecting` | `live` | `reconnecting` | `offline` (mismos que hoy pinta `DeliveryPage`).

Reglas:

1. `visibilitychange` + cleanup de unmount.
2. Si `shouldOpen...` es false: `AbortController.abort()`, status `offline`.
3. Si true: conectar. Status `live` cuando el `fetch` devuelve 200 y hay `response.body` (equivalente a `onopen` del WS). No esperar al primer evento.
4. Al pasar a `visible` con restaurante: GET lista (onReconnect) y abrir SSE.
5. Duración máx del stream: **240_000 ms**, luego abort y reconectar (status `reconnecting`).
6. Error de red / cierre inesperado: backoff 1 s → 30 s, igual que el WS actual.
7. Debounce del refetch por evento: 300 ms (igual que hoy).

Borrar `useRestaurantDispatchSocket.ts`.

### 8.4 Poll

| Condición | Poll 20 s |
|---|---|
| Pestaña oculta | no |
| SSE `live` | no |
| Visible y no `live` | sí |

### 8.5 Formulario

En `DeliveryPage`:

- Estado `notes` controlado.
- En el `submit`: no `event.currentTarget.reset()`.
- Tras 201: `setNotes('')` junto al resto de limpiezas.
- `FormData` deja de ser necesario para notes.

El indicador live no cambia de copy.

## 9. Errores

| Caso | Comportamiento |
|---|---|
| POST create falla con `ApiError` | mostrar `error.message` (igual que hoy) |
| POST create lanza otra cosa | “No se pudo solicitar el delivery.” — ya no debe ocurrir por `reset()` |
| SSE 401/403/404 | status `offline`; poll 20 s si visible |
| SSE se cae | `reconnecting` + backoff; poll mientras no esté `live` |
| Hub no arrancó | `publish_sync` descarta el evento (log debug, igual que hoy) |
| Pestaña oculta | abort inmediato; no reconectar hasta `visible` |

## 10. Tests

### 10.1 Hub (pytest)

- `subscribe` + `publish_sync` entrega `{"type": "dispatch.updated"}` a la cola.
- Tras `unsubscribe`, un publish no encola.
- Cola llena: no lanza; el publish más reciente queda.

### 10.2 API

- GET events sin token → 401.
- User sin acceso → 403.
- Owner: `content-type` empieza por `text/event-stream`; tras `publish_sync` el body incluye `event: dispatch.updated`.
- La ruta WS `/ws/restaurants/{id}/dispatch` **no existe** (mismo estilo que `test_public_tracking_ws_route_removed`).
- `test_create_dispatch_publishes_restaurant_realtime_event` sigue verde (sigue monkeypatcheando `publish_sync`).

### 10.3 Frontend (`node --import tsx --test`)

- `shouldOpenRestaurantDispatchSse`: false si hidden, sin token, o sin restaurantId.
- `parseRestaurantDispatchSseBlock`: `dispatch.updated` → evento; `: ping` y basura → `null`.
- No test de componente de `DeliveryPage`: el `reset()` desaparece; `notes` es estado. Criterio 1 se verifica a mano.

## 11. Criterio de hecho

1. Solicitar repartidor en `/delivery` crea el envío y muestra el aviso de éxito, **sin** el banner rojo.
2. Con la pestaña visible, asignar/cancelar desde otro cliente actualiza la lista sin recargar.
3. Cambiar de pestaña: en DevTools Network el SSE desaparece (abort).
4. Volver a `/delivery` visible: GET lista + SSE otra vez.
5. No queda ningún cliente abriendo `WS /ws/restaurants/.../dispatch`.
6. Monitor y rider app siguen en sus WebSockets.

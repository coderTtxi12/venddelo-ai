# Tracking público: Supabase Realtime en lugar del WebSocket del backend

> **Estado:** pendiente de revisión del usuario antes del plan de implementación.
> **Fecha:** 2026-08-20
> **Apps:** `frontend/` (`/rastreo/[token]`), `backend/` (quitar WS + hub), Postgres/Supabase (triggers Broadcast)

## 1. Objetivo

El link de rastreo es **solo lectura**. Hoy abre un WebSocket al backend (`/ws/public/dispatch-tracking/{token}`) que ocupa un slot de Cloud Run mientras la pestaña está abierta, y reemite GPS en cada ping del rider.

Cambiar el live path a **Supabase Realtime Broadcast** desde Postgres. El snapshot inicial sigue saliendo del GET público. Realtime solo corre **mientras el usuario está viendo** el pedido y el envío no ha terminado.

## 2. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Snapshot inicial | Sigue `GET /api/v1/public/dispatch-tracking/{token}` (DTO público: foto, placa recortada, sin PII interna) |
| Live | Supabase Realtime **Broadcast**, no `postgres_changes` sobre tablas de dominio |
| Canal | `tracking:{token}` — el token opaco es el secreto (igual que el WS actual) |
| Eventos | `updated` (cliente vuelve a hacer GET) y `location` (parche lat/lng/eta) |
| Quién emite | Triggers Postgres → `realtime.send`. El backend **no** publica tracking |
| Visibilidad | Pestaña visible **y** status ∉ `{delivered, cancelled}` |
| Auth del cliente | Anon key. El visitante del link **no** inicia sesión |
| Canal privado | `private = false` en `realtime.send` y en el channel del cliente |
| Local Docker | Si no existe `realtime.send`, el trigger es no-op. Poll 20 s solo con pestaña visible y pedido en curso |
| Monitor / rider / kitchen | Sin cambios. Siguen hubs in-memory del backend |
| UI | Misma página. No hay paleta, copy de estados, ni mapa nuevos |

## 3. Fuera de alcance

- Mover el GET público a una vista PostgREST.
- RLS `anon` sobre `delivery_dispatch_requests` o `delivery_drivers`.
- Redis / Realtime para monitor, rider o cocina.
- Presence (cuántos están viendo el link).
- Subir timeout/concurrency de Cloud Run.

## 4. Estado actual

| Pieza | Hoy |
|---|---|
| Página | `frontend/src/app/rastreo/[token]/page.tsx` → `PublicTracking` |
| Snapshot | `GET /public/dispatch-tracking/{token}` → `build_public_tracking_dto` |
| Live | `usePublicTrackingSocket` → `WS /ws/public/dispatch-tracking/{token}` |
| Hub | `TrackingRealtimeHub` in-memory, bind en `main.py` |
| Status change | `notify_request_realtime` → `emit_public_tracking_snapshot` (DTO completo por WS) |
| GPS | `notify_driver_location_realtime` → `emit_public_tracking_location` (lat/lng/eta) |
| Fallback | Poll 20 s si el socket no está `live` (también con pestaña oculta) |
| Test WS | `test_restaurant_dispatch_requests.py` abre el websocket público |

## 5. Arquitectura

```
Cliente /rastreo/{token}
  │
  ├─ GET público (backend) ── DTO: status, rider, pickup, dropoff, eta
  │
  └─ si visible && status en curso
       supabase.channel('tracking:{token}')
         on broadcast updated  → GET de nuevo
         on broadcast location → parche rider.lat/lng + eta_seconds

UPDATE delivery_dispatch_requests
  → trigger → realtime.send(topic tracking:{token}, event updated, payload {})

UPDATE delivery_drivers.last_lat/last_lng
  → trigger → para cada request asignado en assigned|picked_up|in_transit
       realtime.send(topic tracking:{token}, event location, payload {lat,lng,eta})
```

El ping GPS del rider sigue siendo `POST /rider/me/location` (204). Eso actualiza Postgres; el trigger de tracking sustituye `emit_public_tracking_location`. El monitor **sigue** recibiendo `notify_dispatch_monitor_changed` desde el backend.

## 6. Contrato Broadcast

Topic: `tracking:{token}` (`token` = `delivery_dispatch_requests.tracking_token`, hex ≥ 32 chars).

### 6.1 `updated`

- **Cuándo:** `INSERT`, o `UPDATE OF` columnas que el DTO público puede mostrar: `status`, `assigned_driver_id`, `customer_name`, `dropoff_lat`, `dropoff_lng`, `dropoff_address`, `payment_method`, `collect_cents`, `cash_denomination_cents`, `package_count`, `cancelled_at`, `picked_up_at`, `in_transit_at`, `delivered_at`.
- **No emitir** en ticks internos (`next_attempt_at`, `decision_json`, `cycle_*`). Eso dispararía GET en cada ciclo del motor.
- **Payload:** `{}`.
- **Cliente:** llama otra vez `getPublicDispatchTracking(token)` y reemplaza el estado. Si el nuevo status es `delivered` o `cancelled`, cierra el canal y no lo vuelve a abrir.

No reconstruir el DTO en SQL: foto, placa recortada y teléfono público viven en el GET.

### 6.2 `location`

- **Cuándo:** `UPDATE` de `delivery_drivers` que cambia `last_lat` o `last_lng`, ambos NOT NULL.
- **Destino:** requests con `assigned_driver_id = NEW.id` y `status IN ('assigned','picked_up','in_transit')`.
- **Payload:**

```json
{
  "latitude": 19.43,
  "longitude": -99.13,
  "eta_seconds": 420
}
```

`eta_seconds` usa la misma regla que `tracking_eta_seconds` en Python:

- destino = pickup del restaurante si `status = assigned`, si no dropoff
- haversine, radio 6_371_000 m, velocidad 8 m/s
- `null` si faltan coords de destino

El cliente parchea `tracking.rider.latitude/longitude` y `eta_seconds`. Si aún no hay `rider` en el snapshot, ignora el evento (un `updated` posterior trae el rider).

## 7. Triggers Postgres

Migración Alembic nueva (siguiente número libre tras el head actual).

Funciones `SECURITY DEFINER`, `SET search_path = public, realtime, pg_temp`.

### 7.1 Helper `tracking_realtime_send(topic text, event text, payload jsonb)`

```
IF to_regprocedure('realtime.send(jsonb, text, text, boolean)') IS NULL THEN
  RETURN;  -- Docker local / Postgres sin extensión Realtime
END IF;
PERFORM realtime.send(payload, event, topic, false);
```

No fallar el `UPDATE` del rider si Realtime no está.

### 7.2 `delivery_dispatch_requests` → `updated`

`AFTER INSERT OR UPDATE OF` las columnas de §6.1 → `tracking_realtime_send('tracking:' || NEW.tracking_token, 'updated', '{}'::jsonb)`.

### 7.3 `delivery_drivers` → `location`

`AFTER UPDATE OF last_lat, last_lng` cuando ambos valores no son null.

Por cada request live asignado a ese driver:

1. Leer `dropoff_lat/lng` de la request y `latitude/longitude` del restaurante (`restaurants`).
2. Calcular `eta_seconds` (función SQL `public.tracking_eta_seconds(...)` espejo de Python).
3. `tracking_realtime_send('tracking:' || token, 'location', payload)`.

### 7.4 Supabase hosted

En el proyecto Supabase hay que tener Realtime Broadcast activo (default). No hace falta añadir las tablas de dominio a `supabase_realtime` publication: **no usamos `postgres_changes`**.

No hay políticas RLS nuevas en `delivery_*`. El visitante no hace SELECT anónimo a esas tablas.

## 8. Frontend

Reemplazar `usePublicTrackingSocket` por `usePublicTrackingRealtime`.

Cliente: `createClient()` de `frontend/src/lib/supabase/client.ts` (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`). La página de rastreo ya corre en esa app.

### 8.1 Cuándo suscribirse

Todo debe cumplirse:

1. Componente montado en `/rastreo/{token}`.
2. Primer GET 200.
3. `document.visibilityState === 'visible'`.
4. `tracking.status` no es `delivered` ni `cancelled`.

Si falla cualquiera: `channel.unsubscribe()`, status `offline`.

Al volver a `visible` con pedido en curso: GET fresco, luego suscribir.

`visibilitychange` + cleanup de unmount.

### 8.2 Channel

```ts
supabase.channel(`tracking:${token}`, { config: { broadcast: { self: false } } })
  .on('broadcast', { event: 'updated' }, handler)
  .on('broadcast', { event: 'location' }, handler)
  .subscribe()
```

Canal público (equivale a `private: false` del send). Sin JWT de usuario.

### 8.3 Poll de respaldo

Igual que hoy (20 s), **más** las reglas de visibilidad:

| Condición | Poll |
|---|---|
| Pestaña oculta | no |
| `delivered` / `cancelled` | no |
| Realtime `live` | no |
| Visible + en curso + Realtime no `live` | sí, 20 s |

### 8.4 Indicador “en vivo”

Sigue el mismo `socketStatus` (`connecting` / `live` / `reconnecting` / `offline`) que ya pinta `PublicTracking`.

## 9. Backend a quitar

| Quitar | Dejar |
|---|---|
| `WS /ws/public/dispatch-tracking/{token}` en `ws.py` | `GET /public/dispatch-tracking/{token}` |
| `app/infra/realtime/tracking_hub.py` | `build_public_tracking_dto`, `tracking_eta_seconds`, `LIVE_TRACKING_STATUSES` |
| Bind/shutdown del hub en `main.py` | `notify_dispatch_monitor_changed`, `notify_rider_updated`, restaurant dispatch hub |
| `emit_public_tracking_snapshot` | `notify_request_realtime` **sin** emit de tracking |
| `emit_public_tracking_location` | `notify_driver_location_realtime` **sin** emit de tracking |
| `tests/modules/test_tracking_realtime_hub.py` | Tests del GET público |
| WS assert en `test_restaurant_dispatch_requests.py` | — |

`tracking_view.py` deja de importar el hub.

## 10. Errores

| Caso | Comportamiento |
|---|---|
| Token inexistente | GET 404. No se abre canal. Copy actual de error |
| Token corto / basura | Igual que hoy en GET |
| Realtime no conecta | `offline` + poll 20 s si visible y en curso |
| `realtime.send` ausente (local) | Trigger no-op; poll cubre el mapa |
| Evento `location` sin rider en estado | Ignorar |
| GET falla tras `updated` | Conservar último snapshot; mostrar el aviso de “No se pudo actualizar…” si ya había datos |

Un `UPDATE` de GPS **nunca** debe fallar porque Broadcast esté caído.

## 11. Tests

### 11.1 SQL (pytest + Postgres de test)

- Helper no lanza si `realtime.send` no existe.
- Trigger de request: actualizar status no rompe el UPDATE (siempre).
- Trigger de location: con función `send` mockeada o tabla de captura, un UPDATE de GPS de un driver asignado `in_transit` emite un row al topic `tracking:{token}` y **no** emite si el request está `delivered`.
- ETA SQL: mismo resultado (redondeado) que `tracking_eta_seconds` de Python en un caso fijo.

Si el Postgres de CI no tiene `realtime`, los tests de emisión usan un stub SQL (`CREATE SCHEMA realtime; CREATE FUNCTION realtime.send...` que inserta en una tabla `realtime_send_log`) **solo en el test**, no en la migración de prod.

### 11.2 Frontend

- Hook: no llama `channel()` si `document.hidden`.
- `visibilitychange` a hidden → unsubscribe.
- Status `delivered` → unsubscribe, sin poll.
- Evento `location` parchea rider.
- Evento `updated` dispara GET.

### 11.3 API

- GET público: tests existentes siguen verdes.
- El websocket público deja de existir: quitar/adaptar el test que hace `websocket_connect` a esa ruta (hoy espera snapshot `tracking.updated`).

## 12. Criterio de hecho

1. Abrir `/rastreo/{token}` con pedido `assigned`: mapa recibe GPS sin WebSocket al API.
2. Cambiar de pestaña: en DevTools/Supabase no queda el channel abierto.
3. Volver a la pestaña: GET + channel otra vez.
4. Marcar entregado: channel se cierra y no reabre.
5. Cloud Run: cero conexiones WS de tracking.
6. Monitor y rider app siguen recibiendo sus eventos por el hub del backend.

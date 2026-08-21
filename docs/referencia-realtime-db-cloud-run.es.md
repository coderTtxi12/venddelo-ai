# Realtime, SSE, WebSockets y conexiones a DB — referencia

Documento de **cómo está el sistema hoy** y **qué reglas aplicar** al añadir features. No sustituye los specs de cada corte; resume el trabajo de saturación Cloud Run / pooler Supabase (ago 2026).

## Specs y planes (índice)

Arquitectura / Cloud Run / DB:

| Doc | Qué cubre |
|---|---|
| `docs/TECH_ARCHITECTURE.es.md` §3.5 | Intención original: WS + Redis Pub/Sub + `RealtimePort`. **Hoy** los hubs son in-memory; Redis **no** es backplane de sockets. |
| `docs/PROJECT_PLANNING.es.md` | Fase 10 Cloud Run; realtime marcado TBD (histórico). |
| `docs/superpowers/specs/2026-06-17-backend-docker-cloud-run-design.md` | Imagen, `PORT`, NullPool en pooler, health, **sin** tuning profundo de WS. |
| `docs/superpowers/specs/2026-06-13-phase-3-persistence-layer-design.md` | NullPool + `prepare_threshold=None` en `:6543`. Plan: `plans/2026-06-13-phase-3-persistence-layer.md`. |
| `docs/superpowers/specs/2026-06-14-phase-5-redis-cross-cutting-design.md` | Cache / rate limit / idempotency. Rate limit **solo** `/public/*`. No pub/sub de hubs. |

Cocina (WS):

| Doc | Qué cubre |
|---|---|
| `docs/superpowers/specs/2026-06-24-kitchen-orders-realtime-design.md` | WS pedidos cocina. |
| `docs/superpowers/specs/2026-07-20-kitchen-orders-fast-load-phase-1-design.es.md` | Carga inicial. |
| `docs/superpowers/specs/2026-07-20-kitchen-orders-fast-load-phase-2-design.es.md` | Eventos WS coherentes con filtro. |
| `docs/superpowers/specs/2026-07-20-kitchen-orders-fast-load-phase-3-design.es.md` | Invalidar cache al evento WS. |

Dispatch / rastreo / rider:

| Doc | Qué cubre |
|---|---|
| `docs/superpowers/specs/2026-08-17-delivery-dispatch-riders-design.es.md` | Cloud Tasks + min instances 0; GPS ~15 s; WS rider no es el interruptor v1. Plan: `plans/2026-08-17-delivery-dispatch-riders.md`. |
| `docs/superpowers/specs/2026-08-20-public-tracking-supabase-realtime-design.es.md` | Rastreo público vía Broadcast. Plan: `plans/2026-08-20-public-tracking-supabase-realtime.md`. |
| `docs/superpowers/specs/2026-08-20-restaurant-delivery-sse-design.es.md` | `/delivery` del restaurante: SSE en lugar de WS. Plan: `plans/2026-08-20-restaurant-delivery-sse.md`. |

Assistant (SSE, timeout 288 s, UoW):

| Doc | Qué cubre |
|---|---|
| `backend/docs/assistant-chat-streaming.md` | Contrato SSE del chat. |
| `docs/superpowers/plans/2026-06-26-assistant-chat-streaming.md` | Primer corte SSE. |
| `docs/superpowers/specs/2026-06-27-agentic-assistant-design.es.md` | Loop + SSE en el mismo contenedor Cloud Run. |
| `docs/superpowers/specs/2026-07-30-assistant-clarify-tool-design.es.md` | Clarify 288 s; timeout Cloud Run > 288; registry in-process (multi-instancia rompe). |
| `docs/superpowers/specs/2026-06-30-assistant-mutation-confirm-design.es.md` | Confirmaciones mid-stream; estado en Postgres. |

No hay spec dedicado de JWKS singleton ni de “Approach A” (UoW corto en WS): quedó en código (`main.py`, `deps.py`, `*/ws.py`). Este archivo es la referencia operativa de ese corte.

---


## 1. Por qué se tocó esto

El síntoma era “la app está caída” con HTTP **429** de Cloud Run: *no available instance*.

La causa no era “demasiados usuarios”, sino **requests largos ocupando concurrency**:

```
Riders / dashboards generan requests
        ↓
Algunos esperan DB ~60s (pooler Supabase ECHECKOUTTIMEOUT / SSL cortado)
        ↓
Cada request (y cada WS) ocupa 1 slot de concurrency de la instancia
        ↓
Instancia llena → Cloud Run escala (min instances = 0 → cold start)
        ↓
429 → el front muestra “no se pudo conectar”
```

Cloud Run (prod, acordado):

| Setting | Valor |
|---|---|
| min instances | 0 |
| max instances | 4 |
| request timeout | 300 s |
| concurrency | 80 por instancia |

Un **WebSocket abierto cuenta como 1 request concurrente durante toda su vida**. Un SSE igual. Un GET de 60 s también.

Los hubs de realtime del API son **in-memory**. Realtime entre instancias **no está garantizado**. Concurrency 80 existe en parte para **quedarse en 1 instancia** el mayor tiempo posible. Si escalas a 2+, el notify del rider en la instancia B no llega al monitor en la A.

Timeout 300 s está atado al assistant: `assistant_clarify_timeout_seconds = 288`. No bajar el timeout de Cloud Run por debajo de eso.

---

## 2. Inventario actual de transportes

| Superficie | Transporte | ¿Ocupa slot Cloud Run? | ¿Sesión DB durante el loop? |
|---|---|---|---|
| Cocina (`MainLayout`, todas las páginas del dashboard restaurante) | WS `/ws/restaurants/{id}/orders` | Sí, 1 por pestaña | No (UoW solo en handshake) |
| Monitor delivery `/monitor` | WS `/ws/delivery-providers/me/dispatch` | Sí | No |
| App rider (online) | WS `/ws/rider/me` | Sí | No |
| Preview menú live (editor) | WS `/ws/restaurants/{id}/digital-menu` | Sí | No |
| Dashboard restaurante `/delivery` | **SSE** `GET .../dispatch/events` | Sí mientras el stream vive | No (UoW corto al autorizar) |
| Link público `/rastreo/{token}` | **Supabase Realtime Broadcast** + GET snapshot | Solo los GET (ms) | N/A en Cloud Run |
| Assistant chat | SSE `POST .../assistant/chat` | Sí, hasta ~288 s | **Sí — UoW retenido durante el stream** (deuda) |
| GPS rider | `POST /rider/me/location` → **204** | Solo el POST corto | UPDATE GPS, sin armar perfil |
| Dispatch motor | Cloud Tasks (no loop en el contenedor) | Request del task | Corto |

Poll HTTP de respaldo: **solo si el canal live está caído** (monitor 15 s, delivery restaurante, rastreo 20 s). No poll + WS/SSE a la vez.

---

## 3. Reglas para features nuevas

### 3.1 Elegir el transporte

Orden de preferencia para **lectura pública o de muchos clientes**:

1. **Supabase Realtime Broadcast** (triggers Postgres → `realtime.send`) si el cliente ya tiene anon key, el payload es chico y **no** quieres slot Cloud Run. El token/secreto va en el nombre del topic (`tracking:{token}`). No uses `postgres_changes` sobre tablas de dominio (filtras PII).
2. **SSE** (`GET` + `StreamingResponse`) si el cliente es un dashboard autenticado y el evento es un *tick* (“refetch”), no un socket bidireccional. Auth en header Bearer. Heartbeat (`: ping`) cada ~15 s para proxies. Cierra UoW **antes** del `while True`.
3. **WebSocket** si ya hay un hub in-memory para ese actor (cocina, monitor, rider) y el cliente es una app de operador. Handshake: JWT + 1 query de autorización, **cierra UoW**, luego `receive_text()` sin DB.
4. **Poll** solo como fallback cuando el canal no está `live`, o para datos que cambian poco.

No añadas un WebSocket nuevo “porque es realtime” si el cliente es anónimo y de larga duración (el rastreo era exactamente ese anti-patrón).

### 3.2 Sesión / pooler (obligatorio)

Prod usa Supabase **pooler `:6543`** → SQLAlchemy **`NullPool`**. Cada sesión abierta = 1 conexión real en el pooler. No hay pool local que las reutilice.

- **Nunca** `Depends(get_uow)` en un handler que luego hace `while True: receive()` o stream LLM. Eso retenía 1 conexión **horas**.
- Patrón correcto: `with SqlAlchemyUnitOfWork() as uow:` para authz, salir del `with`, conectar al hub.
- SSE de `/delivery`: el generador **no** lleva UoW; autoriza, cierra, luego `hub.subscribe()`.
- Hot paths (GPS 15 s): **cero lecturas extra**. Location = UPDATE + notify monitor. No `_to_profile`, no itinerario, no `claim_drivers` si el driver ya tiene `user_id`.
- `claim_drivers` solo cuando `_driver_for_user` no encuentra fila.

### 3.3 Auth JWT / JWKS

`get_auth` lee `request.app.state.auth` (también vale `WebSocket` vía `HTTPConnection`).

Al lifespan:

- `build_supabase_jwt_auth` **una vez**
- `warm_jwks_cache` en thread (min instances 0 → cold start)

**Prohibido** instanciar `SupabaseJwtAuth` / `PyJWKClient` por request (spameaba `jwks.json` a Supabase).

### 3.4 Clientes (dashboards / rider / rastreo)

- **Debounce** de refetch disparado por eventos (monitor ~400 ms, dispatch restaurante similar).
- **In-flight guard**: no apilar `getMyDispatchMonitor` si ya hay uno en curso.
- **Poll solo si `connectionStatus !== 'live'`**.
- **Visibility**: si el usuario no está mirando (rastreo, `/delivery`), no mantener SSE/Realtime.
- Reconnect con backoff (1 s → 30 s). Al reconectar, **un GET fresco**.
- `ApiError` en `frontend/` usa **`httpStatus`**, no `status` (el build de Vercel revienta si no).

### 3.5 Cloud Run

- Cada WS/SSE abierto = 1 de 80. Diseña para **pocos** sockets de operador, no para N clientes públicos.
- Request timeout 300 s: streams LLM / clarify deben terminar antes. Import de menú muy largo puede cortarse.
- Hubs in-memory: features que *requieran* fan-out entre instancias necesitan Redis pub/sub (aún no está para estos hubs). Hasta entonces, no bajes concurrency para “forzar escala”.
- Rate limit actual: solo rutas `/public/*`. No protege rider ni dashboards autenticados.

---

## 4. Qué se implementó (mapa rápido)

### DB / auth

| Cambio | Dónde |
|---|---|
| NullPool + `prepare_threshold=None` en pooler | `backend/app/db/session.py` |
| Auth singleton + warm JWKS | `backend/app/main.py`, `infra/auth/supabase_jwt.py`, `api/deps.py` |
| Location ping 204, sin perfil | `rider_api.py`, `RiderDispatchService.update_location` |
| Skip `claim_drivers` si ya linked | `_require_driver` |

### WebSockets (Approach A)

Handshake corto + hub. Archivos: `modules/orders/ws.py`, `menu/ws.py`, `delivery_dispatch/ws.py`. Hubs en `infra/realtime/*_hub.py`, bind en lifespan.

Rider: `apps/rider/lib/rider_socket.dart` — WS al ir online, stop al offline; poll ofertas solo si WS caído; `/me` cada 60 s si live.

### SSE restaurante `/delivery`

Sustituye el WS de dispatch del restaurante. `GET /restaurants/{id}/dispatch/events`. Hub `restaurant_dispatch_hub` ahora también alimenta colas SSE. Front: `useRestaurantDispatchEvents` + visibilidad.

### Rastreo público → Supabase

- GET `/public/dispatch-tracking/{token}` sigue en el API (DTO público).
- Live: topic `tracking:{token}`, eventos `updated` (refetch GET) y `location` (parche GPS).
- Triggers en migración `0063_public_tracking_realtime`.
- Cliente: `usePublicTrackingRealtime`; off si pestaña oculta o status `delivered`/`cancelled`.
- `tracking_realtime_send` es `SECURITY DEFINER` con **REVOKE** a `PUBLIC`/`anon`; `realtime.send` envuelto en `EXCEPTION` para no tumbar el UPDATE de GPS.

Supabase dashboard: Realtime **on** + **Allow public access**. No publicar tablas `delivery_*` en replication.

### Front dashboards

Monitor y Delivery: debounce + poll solo offline. `RestaurantOrdersProvider` sigue montado en **todo** `MainLayout` → 1 WS de cocina por pestaña del dashboard, aunque estés en Settings.

---

## 5. Deuda conocida (no asumir que está resuelto)

| Ítem | Riesgo |
|---|---|
| Assistant SSE retiene `get_uow` todo el turno / clarify | Conexión pooler + slot Cloud Run hasta 288 s |
| WS cocina en `MainLayout` | 1 slot por pestaña, todas las rutas |
| `get_synced_user` SELECT en casi todo request autenticado | Carga extra; no cacheado |
| Location ping aún notifica al monitor cada 15 s | Refetch snapshot pesado si el WS monitor está live |
| Hubs in-memory | Multi-instancia parte el realtime |
| Rate limit no cubre API autenticada | |
| Tests SQL de tracking: el engine de pytest usa `create_all`, no Alembic | Duplicar DDL en fixtures; correr contra Postgres real antes de fiarse |

---

## 6. Checklist al añadir realtime

- [ ] ¿El cliente es público y de larga duración? → preferir Supabase Broadcast, no WS al API.
- [ ] ¿El handler deja UoW/sesión abierta durante el loop? → no.
- [ ] ¿El evento frecuente (GPS) arma DTOs pesados? → no; 204 + notify mínimo.
- [ ] ¿El front refetch en cada evento sin debounce / in-flight guard? → no.
- [ ] ¿Poll y canal live a la vez? → no.
- [ ] ¿Visibilidad / estado terminal cierran el canal? → sí, si no hay nada que rastrear.
- [ ] ¿Payload de Broadcast incluye PII de tablas internas? → no.
- [ ] ¿Un `SECURITY DEFINER` nuevo es ejecutable por `anon` vía RPC? → REVOKE.
- [ ] ¿Cloud Run timeout 300 s cubre el stream? Clarify ya usa 288 s.
- [ ] ¿Escala a 2 instancias rompería este fan-out? Si sí, documenta o usa Redis.

---

## 7. Archivos ancla

| Área | Ruta |
|---|---|
| Pooler | `backend/app/db/session.py` |
| Lifespan hubs + JWKS | `backend/app/main.py` |
| Auth dep | `backend/app/api/deps.py` |
| Notify monitor / rider / restaurant | `backend/app/modules/delivery_dispatch/monitor_notify.py` |
| WS + SSE dispatch | `backend/app/modules/delivery_dispatch/ws.py` |
| Tracking DTO (GET) | `backend/app/modules/delivery_dispatch/tracking_view.py` |
| Triggers tracking | `backend/migrations/versions/0063_public_tracking_realtime.py` |
| Rastreo front | `frontend/src/lib/dispatch/usePublicTrackingRealtime.ts` |
| Rider WS | `apps/rider/lib/rider_socket.dart` |

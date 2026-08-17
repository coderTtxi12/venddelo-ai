# Alta de repartidores, solicitudes de envío y motor de asignación

> **Estado:** pendiente de revisión del usuario antes del plan de implementación.  
> **Fecha:** 2026-08-17  
> **Apps:** `delivery-dashboard/`, `frontend/` (panel restaurante + rastreo público), `backend/`, `apps/rider/` (Flutter)

## 1. Objetivo

El owner/admin de una empresa de delivery da de alta repartidores. El restaurante con partnership Mexy **activa** solicita un envío a mano (no sale del menú digital). Un motor de asignación ofrece el envío a un rider en la app Flutter. Cloud Run sigue en `min instances = 0`: el trabajo se despierta con **Cloud Tasks**, no con un loop en el contenedor.

Fuera de este corte: asignar órdenes del checkout del menú digital; Celery/Redis para este flujo; un worker/servicio aparte.

## 2. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Origen de envíos v1 | Solo “Solicitar delivery” del restaurante. El menú digital no entra al motor |
| Arquitectura | Tablas nuevas + motor puro + misma API FastAPI |
| Despertar jobs | Cloud Tasks en `search_at` / expire / retry. Local: backend `stub` que llama el mismo handler |
| Loop asyncio en la API | No. Incompatible con Cloud Run `min instances = 0` |
| Redis / Celery | No para este flujo |
| Zonas | El rider cubre **todas** las zonas de la empresa. `zone_id` en la solicitud es del partnership (tarifa), no un filtro de riders |
| Destinos por formulario | **Un** dropoff y N paquetes. 1 solicitud = 1 rider. Casos B/C/D miran **otras** solicitudes concurrentes |
| Login rider | Google, el mismo correo del alta (claim como operadores) |
| Alta riders | Solo owner/admin. Operador: lista de solo lectura |
| Crédito cash | Hold al **aceptar**. Libera el **restaurante** con “Rider ya me pagó”. El rider no se auto-libera |
| Timeout de oferta | Default 45 s, editable por empresa |
| Casi libre | Si ETA al dropoff actual ≤ `pre_free_eta_seconds` (default 60), cuenta como libre para A/B |
| Online | Flag persistido. Se apaga solo si el rider apaga “En línea” (o un admin lo bloquea) |
| GPS | Servicio en **background** (~15 s) mientras esté online. Stale default 90 s |
| Ofertas en background | FCM de alta prioridad. Poll HTTP de respaldo. Websocket no es el interruptor ni el transport v1 |
| Pago editable | Solo si aún no hay rider **asignado** |
| Rastreo | `{subdominio}.{MENU_PUBLIC_DOMAIN}/rastreo/{token}` (local: `{subdominio}.localhost/rastreo/{token}`) |
| UI paneles | Tokens e Inter/MUI actuales. Sin paleta ni fuente nuevas |
| Cercanía v1 | Geodésica al restaurante. Distance Matrix queda fuera de v1 |
| ETA “casi libre” v1 | Distancia geodésica / `8 m/s` (~30 km/h) |

## 3. Estado actual (lo que hay que dejar de asumir)

- `delivery_provider_members.member_role` ya permite `'driver'`, pero no hay ficha (INE, moto, crédito, compartimento).
- `delivery_provider_admin_invites` solo admite `admin|operator`. El claim de riders **no** reutiliza esa tabla: usa `delivery_drivers.email`.
- `delivery_assignments` está atado a `orders.id` (checkout). **No** se reutiliza para este flujo.
- El panel de Mexy invita equipo con Google; no hay pantalla de repartidores.
- El sidebar del restaurante no tiene “Delivery”.
- `apps/rider` (`mexy_rider`) es un stub Flutter.
- Uploads de empresa ya van a Storage (imagen). Este flujo también acepta **PDF** en INE, licencia y seguro.
- El menú público ya resuelve tenant por subdominio (`mxy.mx` / `{sub}.localhost`).

## 4. Modelo de datos

Migración: `0052_delivery_dispatch` (revisa `0051_delivery_multi_zone`).

Montos en **centavos** (`*_cents`), igual que el resto del backend.

### 4.1 `delivery_drivers`

Una ficha por rider por empresa.

| Columna | Notas |
|---|---|
| `delivery_provider_id` | FK, ON DELETE CASCADE |
| `user_id` | FK `users.id`, nullable hasta el primer Google login |
| `email` | NOT NULL, normalizado `lower(btrim)` |
| `first_name`, `last_name` | NOT NULL |
| `phone` | NOT NULL |
| `profile_photo_path` | NOT NULL |
| `ine_document_path` | NOT NULL (imagen o PDF) |
| `license_document_path` | NOT NULL |
| `insurance_document_path` | NOT NULL |
| `credit_limit_cents` | NOT NULL, default `50000` ($500 MXN) |
| `credit_held_cents` | NOT NULL, default `0` |
| `compartment_size` | `'normal' \| 'grande'` |
| `plate`, `motorcycle_brand`, `motorcycle_color` | NOT NULL |
| `status` | `'invited' \| 'active' \| 'blocked'` |
| `is_online` | NOT NULL, default `false` |
| `last_lat`, `last_lng` | nullable |
| `location_updated_at` | nullable, timestamptz |
| `fcm_token` | nullable |

Constraints:

- Unique `(delivery_provider_id, lower(btrim(email)))`.
- Check `credit_held_cents >= 0 AND credit_held_cents <= credit_limit_cents`.
- Check `compartment_size` y `status` con los valores de arriba.
- Índice `(delivery_provider_id, status, is_online)` para el motor.

Al crear: `status = invited`, `user_id` null, `is_online = false`.  
Al claim (Google con ese email): `user_id` se llena, `status = active`, se inserta `delivery_provider_members` con `member_role = 'driver'` si no existe.  
Bloquear: `status = blocked`, `is_online = false`; no recibe ofertas.

Crédito disponible = `credit_limit_cents - credit_held_cents`.

### 4.2 `delivery_provider_assignment_settings`

1:1 con la empresa (no por zona).

| Columna | Default |
|---|---|
| `delivery_provider_id` | PK/FK unique |
| `offer_timeout_seconds` | `45` |
| `pre_free_eta_seconds` | `60` |
| `driver_location_staleness_seconds` | `90` |
| `min_protected_drivers` | `2` |
| `high_demand_available_drivers_max` | `2` |
| `high_demand_occupied_ratio` | `0.80` |
| `high_demand_pending_min` | `5` |
| `near_destination_radius_meters` | `800` |
| `max_extra_route_minutes` | `8` |
| `max_pickup_detour_minutes` | `8` |
| `max_destination_detour_minutes` | `8` |
| `max_active_packages_per_driver` | `3` |
| `assignment_retry_seconds` | `30` |
| `assignment_timeout_seconds` | `900` (15 min desde `search_at`) |
| `pre_free_speed_mps` | `8` (solo servidor; no se edita en UI v1) |

Seed al crear la empresa o al migrar: una fila por `delivery_providers` existente, con esos defaults.

### 4.3 `delivery_search_lead_times`

Filas por empresa. Unique `(delivery_provider_id, prep_minutes)`.

Defaults al seed:

| `prep_minutes` | `search_ahead_minutes` | Significado |
|---|---:|---|
| 5 | 0 | Buscar de inmediato |
| 10 | 5 | 5 min antes de `ready_at` |
| 15 | 6 | 6 min antes |
| 20 | 7 | 7 min antes |
| 30 | 9 | 9 min antes |

`search_at = ready_at - search_ahead_minutes`. Si el resultado es ≤ ahora, `search_at = now`.  
Si el restaurante elige un `prep_minutes` que no está en la tabla, 400. La UI solo ofrece esas filas (editables los `search_ahead_minutes`, no se borran las cinco filas en v1).

### 4.4 `delivery_dispatch_requests`

No hay FK a `orders`.

| Columna | Notas |
|---|---|
| `restaurant_id` | FK |
| `delivery_provider_id` | FK del partnership activo al crear |
| `zone_id` | FK zona del partnership (tarifa/quote) |
| `customer_name`, `customer_phone` | NOT NULL |
| `dropoff_lat`, `dropoff_lng` | NOT NULL |
| `dropoff_address` | texto mostrado |
| `dropoff_maps_url` | nullable, si pegó link |
| `payment_method` | `'cash' \| 'transfer' \| 'card_terminal'` |
| `collect_cents` | monto a cobrar al cliente (cash y terminal; 0 permitido en transfer) |
| `cash_denomination_cents` | nullable; obligatorio si `cash` |
| `package_size` | `'normal' \| 'grande'` |
| `package_count` | INT ≥ 1 |
| `ready_at` | timestamptz |
| `search_at` | timestamptz |
| `next_attempt_at` | timestamptz, para retry |
| `quoted_fee_cents` | tarifa Mexy al crear (mismo motor de quote que el menú, punto = dropoff) |
| `status` | ver 4.5 |
| `assigned_driver_id` | FK `delivery_drivers`, nullable |
| `tracking_token` | unique, opaco (hex 24+ bytes) |
| `notes` | nullable, texto corto |
| `decision_json` | nullable, audit del último tick del motor |
| `cancelled_at` | nullable |

Índice `(delivery_provider_id, status, search_at)` y `(assigned_driver_id, status)`.

### 4.5 Estados de la solicitud

```text
scheduled → searching → offered → assigned → picked_up → in_transit → delivered
                              ↘ expired-offer vuelve a searching
                 timeout sin rider → unassigned
                 restaurante/admin → cancelled
```

| Status | Quién lo ve |
|---|---|
| `scheduled` | Creada; Cloud Task aún no busca (`now < search_at`) |
| `searching` | Due, sin oferta abierta |
| `offered` | Hay oferta viva a un rider |
| `assigned` | Rider aceptó |
| `picked_up` | Recogió en el negocio |
| `in_transit` | Va al cliente |
| `delivered` | Entregado |
| `unassigned` | Timeout de búsqueda; el restaurante puede reintentar |
| `cancelled` | Terminal |

Reintentar desde `unassigned`: `search_at = now`, `next_attempt_at = now`, `status = searching`, nuevo Cloud Task. No se clona la fila.

### 4.6 `delivery_dispatch_offers`

| Columna | Notas |
|---|---|
| `request_id` | FK |
| `driver_id` | FK |
| `status` | `'offered' \| 'accepted' \| 'rejected' \| 'expired'` |
| `case_applied` | `'A' \| 'B' \| 'C' \| 'D'` |
| `expires_at` | `offered_at + offer_timeout_seconds` |
| `score_json` | nullable |
| `responded_at` | nullable |

Un request tiene **como máximo una** oferta `offered` a la vez. Unique parcial: una sola `offered` por `driver_id`.

### 4.7 `delivery_credit_holds`

| Columna | Notas |
|---|---|
| `driver_id`, `request_id` | unique `(request_id)` |
| `amount_cents` | = `collect_cents` al aceptar cash |
| `status` | `'held' \| 'released'` |
| `released_at` | nullable |
| `released_by_user_id` | usuario del restaurante que confirmó |

Al aceptar cash: insert `held`, `credit_held_cents += amount`.  
Al “Rider ya me pagó” o al cancelar/fallar después de asignar: `released`, se resta el hold (no por debajo de 0).

## 5. Cálculo de `search_at`

El restaurante elige `prep_minutes` de la tabla de la empresa.  
`ready_at = now + prep_minutes`.  
`search_ahead = lead_times[prep_minutes].search_ahead_minutes`.  
`search_at = max(now, ready_at - search_ahead)`.

Ejemplo: prep 10 min, ahead 5 → busca 5 minutos después de crear (5 antes de listo).

## 6. Motor de asignación

Función pura + transacción Postgres. Entrada: `request_id` (y opcionalmente otras solicitudes due de la misma empresa). Salida: oferta(s) o reenqueue.

Al ejecutar el handler de Cloud Task:

1. `SELECT … FROM delivery_dispatch_requests WHERE id = :id AND status IN ('scheduled','searching','offered') FOR UPDATE SKIP LOCKED`.
2. Si `now < search_at`, no-op (task adelantado).
3. Si ya `offered` y no expiró, no-op.
4. Si `now >= search_at + assignment_timeout_seconds` y no hay `assigned`: `unassigned`, no más tasks.
5. Cargar settings, riders, solicitudes due hermanas, ofertas/rutas activas.
6. Elegir caso A–D, crear oferta, FCM, encolar task `expire_offer` a `expires_at`.

Idempotencia: un segundo task concurrente no toma la fila (SKIP LOCKED) o ve la oferta ya creada.

### 6.1 Elegibilidad

Siempre:

- `status = active`, no `blocked`
- `is_online = true`
- GPS fresco: `now - location_updated_at <= driver_location_staleness_seconds`
- Compartimento: si `package_size = grande` → solo `compartment_size = grande`; `normal` acepta ambos
- Capacidad: paquetes ya activos del rider + `package_count` de esta solicitud ≤ `max_active_packages_per_driver` (en C, la suma del grupo)
- Cash: `credit_limit_cents - credit_held_cents >= collect_cents`
- Sin otra oferta `offered` hacia ese rider

Libre para A/B si:

- no tiene solicitud `assigned|picked_up|in_transit`, **o**
- **pre-free:** tiene exactamente un envío `in_transit` y  
  `geodesic_m(last, dropoff) / pre_free_speed_mps <= pre_free_eta_seconds`

Un rider pre-free que acepta: la nueva solicitud queda `assigned` como **siguiente** (recoge en el restaurante **después** de entregar el paquete actual). La app muestra la cola: “entrega actual → luego recoger en {negocio}”.

Para D: puede no estar libre; hace falta compatibilidad de ruta (6.4).

### 6.2 Demanda alta

`high_demand` si **cualquiera**:

- riders que pasan elegibilidad **y** están libres/pre-free ≤ `high_demand_available_drivers_max`
- ocupación (riders con envío activo / riders online frescos) ≥ `high_demand_occupied_ratio`
- solicitudes `scheduled|searching|offered` de la empresa ≥ `high_demand_pending_min`

### 6.3 Casos

Una solicitud del formulario **nunca** se parte en varios riders.

| Caso | Condición | Acción |
|---|---|---|
| A | No alta demanda | El libre/pre-free más cercano al **restaurante** (geodésica) |
| B | No alta demanda y hay **otras** solicitudes ya `due` (`search_at <= now`, no asignadas) | Distintos riders en paralelo, dejando `min_protected_drivers` libres si `libres - asignaciones_de_este_tick >= min_protected_drivers`. Si no hay cupo, se trata el tick como alta demanda |
| C | Alta demanda y ≥2 solicitudes due cuyo dropoff está a ≤ `near_destination_radius_meters` (o extra de ruta ≤ `max_extra_route_minutes` cuando haya matriz; v1 solo radio) | Un rider, orden de paradas por vecino más cercano desde el restaurante del grupo (si son varios negocios, el más cercano al rider). Capacidad de paquetes del grupo |
| D | Alta demanda y no C | Score sobre riders **en ruta** (`picked_up` o `in_transit`): proximidad al nuevo restaurante, cercanía del nuevo dropoff al dropoff actual, desvío vs umbrales, capacidad, delay. Si nadie pasa umbrales, no ofertar |

Prioridad de evaluación: validar → demanda → si normal: A o B → si alta: C si aplica, si no D → si vacío: retry.

### 6.4 Score D (v1)

Enteros 0–100, pesos fijos en código (no UI):

```text
score = pickup_proximity (geodésica rider→restaurante)
      + destination_compatibility (geodésica dropoff_nuevo→dropoff_actual)
      + detour (penaliza si pickup o destino superan max_*_detour; 0 si excede → candidato inválido)
      + capacity
```

Si el extra estimado (geodésica / `pre_free_speed_mps`) > umbral en minutos, el candidato se descarta.

### 6.5 Oferta, rechazo, silencio

- Aceptar: `offer=accepted`, `request=assigned`, hold cash si aplica, `assigned_driver_id` set. 409 si la oferta ya no está `offered`.
- Rechazar: `rejected`; mismo tick o task inmediato busca el **siguiente** candidato (el que rechazó queda fuera de **esta** solicitud el resto del ciclo de búsqueda; puede ofertar en otra solicitud).
- Expirar (task `expire_offer`): `expired`; siguiente candidato. El rider que no respondió **sí** puede volver a salir en un retry posterior de la misma solicitud.
- Lista agotada: `status=searching`, `next_attempt_at = now + assignment_retry_seconds`, Cloud Task `retry` a esa hora.
- Tras `assignment_timeout_seconds` desde el `search_at` original: `unassigned`.

### 6.6 Doble asignación

Al crear la oferta: `SELECT delivery_drivers WHERE id = :id FOR UPDATE`. Si ya tiene oferta `offered` u otro `assigned` que no sea pre-free compatible, se elige otro candidato.

## 7. Cloud Tasks

Payload JSON: `{ "kind": "search"|"expire_offer"|"retry", "request_id": "...", "offer_id": "..." }`.

Endpoint: `POST /api/v1/internal/delivery/tasks`  
Auth producción: OIDC de Cloud Tasks (audience = URL del servicio) o header `X-Delivery-Tasks-Secret` igual a settings.  
Local/test: `delivery_tasks_backend = stub` encola en memoria o llama el handler en proceso (los tests del motor no necesitan GCP).

Al crear la solicitud: task `search` con `schedule_time = search_at`.  
Al ofertar: task `expire_offer` con `schedule_time = expires_at`.  
Al agotar candidatos: task `retry` con `schedule_time = next_attempt_at`.

## 8. APIs

Prefijo existente `/api/v1`. Errores en envelope `{ "error": { "message" } }` como el resto.

**Dashboard (member owner/admin; GET también operator):**

- `GET/POST /delivery-providers/me/drivers`
- `GET/PATCH /delivery-providers/me/drivers/{id}` (bloquear, editar ficha, crédito; no se edita `credit_held_cents` a mano)
- `POST /delivery-providers/me/drivers/{id}/documents` multipart o base64+filename (imagen JPEG/PNG/WebP o PDF; max 8 MB)
- `GET/PATCH /delivery-providers/me/assignment-settings`
- `GET/PATCH /delivery-providers/me/search-lead-times`

**Restaurante (owner/admin del local; partnership Mexy `active`):**

- `POST /restaurants/me/dispatch-requests`
- `GET /restaurants/me/dispatch-requests`
- `PATCH /restaurants/me/dispatch-requests/{id}` — pago solo si `status` ∈ `scheduled|searching|offered|unassigned`
- `POST .../cancel`
- `POST .../retry` — solo `unassigned`
- `POST .../confirm-rider-cash` — solo `delivered` (o `in_transit` si el negocio ya recibió el efectivo; v1: permitido desde `assigned` en adelante para no bloquear el turno) + hold `held`

Sin partnership activa: 403 `"No tienes un repartidor activo"`.

**Rider (member `driver`):**

- `GET /rider/me`
- `PATCH /rider/me/online` `{ "is_online": bool }` — al `true`, exige GPS reciente en el mismo request o el siguiente ping
- `POST /rider/me/location` `{ "latitude", "longitude" }`
- `PUT /rider/me/fcm-token`
- `GET /rider/me/offers` — oferta `offered` vigente
- `POST /rider/me/offers/{id}/accept|reject`
- `POST /rider/me/assignments/{request_id}/picked-up|in-transit|delivered`

**Público:**

- `GET /public/dispatch-tracking/{token}` — estado, dropoff, ETA pobre (geodésica), nombre de pila del rider si asignado. Sin crédito, documentos, teléfono del rider.

**Interno:** `POST /internal/delivery/tasks`

Quote al crear: reutilizar el servicio de cotización público con lat/lng del dropoff y el `zone_id` del partnership. Si el punto no cotiza (fuera de cobertura): 400 con el mensaje de quote actual.

## 9. UIs

Misma tipografía e iconos outlined. Labels asociados; errores `role="alert"`; loading en submit; no emoji como icono.

### 9.1 delivery-dashboard

- Nav **Repartidores**: lista (foto, nombre, email, crédito disponible, compartimento, invitado/activo/bloqueado/en línea). Owner/admin: alta y editar. Operador: lectura.
- Alta: formulario scrolleable (no cortar el mapa/uploads). Crédito default $500 editable. Uploads INE, licencia, seguro, foto.
- **Asignación** (sección en Configuración): tabla de 5 filas prep → minutos de anticipo; timeout oferta; pre-free segundos; stale GPS; reserva protegida; umbrales de demanda; retry/timeout. Copy: “por empresa, no por zona”.

### 9.2 frontend restaurante

- Nav **Delivery** si partnership activa.
- Formulario: cliente, celular, ubicación (Places + pegar URL de Maps; el backend resuelve short links `maps.app.goo.gl` / `goo.gl` y `ll=` / `@lat,lng`). Pago, monto, denominación si cash, “cuánto cobrar” si terminal. Tamaño (el mayor) + número de paquetes. Copy visible: **“Máximo 20 kg en la suma de todos los paquetes.”** Select de `prep_minutes`.
- Tras crear: hora de búsqueda, link de rastreo copiable, lista de solicitudes con estado en texto+icono.
- **Rider ya me pagó** en cash cuando hay hold `held`.

### 9.3 Rastreo público

Ruta en el mismo host de menú: `/rastreo/[token]`. Mapa + estado. Sin login.

### 9.4 Flutter `apps/rider`

- Google Sign-In → JWT igual que los paneles (Supabase). Claim por email.
- Interruptor **En línea**: persistido. Apagarlo es lo único que el rider hace para no recibir pedidos a propósito.
- Al online: pedir ubicación Siempre / foreground service Android (notificación persistente “Mexy usa tu ubicación”) y pings cada 15 s. iOS: permiso Siempre; si el usuario mata la app, el GPS se corta (copy en onboarding).
- FCM: oferta a pantalla completa con countdown.
- Envío activo: recoger / en camino / entregado. Si hay siguiente por pre-free, se muestra la cola.
- No hay alta de ficha en la app.

## 10. Errores

| Situación | Resultado |
|---|---|
| Maps URL inválida | 400 en el campo de ubicación |
| Pago PATCH con rider asignado | 409 `"Ya hay un repartidor asignado"` |
| Aceptar oferta expirada | 409 `"La oferta ya no está disponible"` |
| Paquete grande, solo riders normal | Reintentos hasta `unassigned` |
| Cash, nadie con crédito | Igual |
| Task duplicado | SKIP LOCKED / no-op |
| Cancelar `assigned`+ | `cancelled`, hold `released`, rider ve cancelado |
| Token rastreo inexistente | 404 |
| Upload > 8 MB o tipo no imagen/PDF | 400 |

## 11. Tests (mínimo)

Motor con reloj y GPS inyectados, sin GCP:

- A: un paquete, elige el más cercano al restaurante
- B: dos solicitudes due, dos riders, deja `min_protected_drivers`
- Pre-free: rider `in_transit` a < 60 s cuenta como libre
- GPS stale: excluido
- Grande: rider `normal` excluido
- Cash: rider con crédito insuficiente excluido
- Expire: siguiente candidato
- Timeout: `unassigned`
- Hold al accept y release al confirmar cash
- `search_at` para prep 5 y 10 min

API: owner crea rider; operator 403 en POST; restaurante sin partnership 403; PATCH pago 409 si assigned.

## 12. Fuera de alcance v1

- Motor sobre órdenes del menú digital
- Websocket rider
- Distance Matrix / traffic
- Báscula real (solo copy 20 kg)
- UI de debug `decision_json` para ops (la columna sí se persiste)
- Editar o borrar las cinco filas de lead time (solo los minutos de anticipo)
- App store listing copy legal más allá del onboarding in-app

## 13. Cortes para el plan (un spec, varios PRs lógicos)

El plan de implementación debe producir software testeable en este orden; no un solo PR:

1. Migración + modelos + settings/lead times API + UI config en dashboard
2. CRUD riders + uploads + claim Google + lista dashboard
3. Dispatch requests API + formulario restaurante + rastreo público
4. Motor A/B + ofertas + Cloud Tasks stub + holds de crédito
5. Casos C/D + pre-free + timeout/`unassigned`
6. App Flutter: login, online, GPS background, FCM, oferta, ciclo de entrega

Cada corte deja el anterior usable (p. ej. corte 3 crea solicitudes `scheduled` aunque el motor aún no oferte).

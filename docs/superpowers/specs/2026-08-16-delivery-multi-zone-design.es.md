# Zonas múltiples por empresa de delivery

> **Estado:** pendiente de revisión del usuario antes del plan de implementación.  
> **Fecha:** 2026-08-16  
> **Apps:** `delivery-dashboard/`, `frontend/` (onboarding + ajustes), `backend/`

## 1. Objetivo

Una empresa de delivery (Mexy u otra en `delivery-dashboard`) puede operar **varias zonas**. Cada zona es una unidad operativa completa: cerco, km fuera de cobertura, tarifas día/noche/clima, horarios, clima operativo y pause.

Los restaurantes **siguen pidiendo solo a Mexy**. En onboarding se muestra **una** zona de Mexy: la más cercana que cubra el local. Si ninguna cubre, el restaurante puede activar delivery **sin** solicitud ni courier.

Los partnerships Mexy ya activos no se rompen: se asignan a la zona que hoy es la principal.

## 2. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Matching de restaurantes | Solo zonas de Mexy (`is_mexy_provider_slug`) |
| Tarifas | Independientes por zona (no hay default de empresa) |
| Sin cobertura en onboarding | Delivery on permitido; **no** se crea fila en `restaurant_delivery_providers` |
| Borrar zona con negocios | Prohibido (409) hasta reasignar |
| Última zona | No se puede borrar aunque esté vacía |
| Cambio de zona del restaurante | Solo el courier reasigna; el restaurante no se auto-mueve |
| Horarios, clima, pause | Por zona |
| Timezone y métodos de pago del courier | Siguen siendo de la empresa |
| Cliente envía `zone_id` al crear restaurante | No. El servidor recalcula el match con lat/lng persistidos |

## 3. Estado actual (lo que hay que dejar de asumir)

- `delivery_provider_zones` ya existe (polígono, nombre, `priority`), pero API y cotización usan solo la **zona principal** (`ORDER BY priority, created_at LIMIT 1`).
- `delivery_provider_pricing_configs` es **1:1 con la empresa**.
- `delivery_provider_schedules`, `weather_mode` y `service_manually_enabled` son de la empresa.
- `restaurant_delivery_providers` vincula restaurante ↔ proveedor, **sin zona**.
- Al crear/activar delivery, `ensure_mexy_request_for_restaurant` siempre abre solicitud a Mexy.
- Onboarding del restaurante: switch “Servicio por Mexy Reparto”, sin preview de zona.

## 4. Modelo de datos

Migración siguiente: `0051_delivery_provider_multi_zone` (revisa `0050_marketing_facebook_session_spike`).

### 4.1 `delivery_provider_zones`

Sin cambios de columnas de geografía. Se agrega:

- `weather_mode` `VARCHAR` NOT NULL DEFAULT `'none'` — mismos valores que hoy en el proveedor: `none|light|heavy|intense`.
- `service_manually_enabled` `BOOLEAN` NOT NULL DEFAULT `true`.

Índice único de nombre **por empresa**, case-insensitive y recortado:

```sql
CREATE UNIQUE INDEX uq_delivery_provider_zones_name_per_provider
ON delivery_provider_zones (delivery_provider_id, lower(btrim(name)));
```

Nombre vacío o solo espacios: 400. Longitud máxima 200 (igual que hoy).

### 4.2 `delivery_provider_pricing_configs`

- Agregar `zone_id` UUID NOT NULL FK → `delivery_provider_zones.id` ON DELETE CASCADE.
- Unique en `zone_id` (1:1 zona ↔ precios).
- Conservar `delivery_provider_id` para listados.
- Quitar unique de `delivery_provider_id`.

`outside_polygon.max_distance_km` de **esa** fila es el rango de matching y de cotización fuera de cerco para esa zona.

### 4.3 `delivery_provider_schedules`

- Agregar `zone_id` UUID NOT NULL FK → `delivery_provider_zones.id` ON DELETE CASCADE.
- El índice de lookup pasa a `(zone_id, schedule_kind, day_of_week)`.
- Varios slots por día siguen permitidos (misma semántica actual).

### 4.4 `restaurant_delivery_providers`

- Agregar `zone_id` UUID FK → `delivery_provider_zones.id` ON DELETE RESTRICT.
- Unique sigue siendo `(restaurant_id, delivery_provider_id)`: una fila por restaurante–Mexy; la zona es un campo de esa fila.
- Migración: columna nullable → backfill → `ALTER … SET NOT NULL`. No existen filas “sin zona”.

ON DELETE RESTRICT refuerza el 409 de aplicación: no se puede borrar una zona referenciada.

### 4.5 Columnas que salen del proveedor

Tras backfill a la zona principal de cada empresa:

- Quitar `delivery_providers.weather_mode`.
- Quitar `delivery_providers.service_manually_enabled`.

Timezone, logo, nombre, métodos de pago y membresías **no** se mueven.

### 4.6 Backfill (orden)

Para cada `delivery_providers`:

1. Tomar la zona activa más antigua por `priority ASC, created_at ASC` (la “principal” de hoy). Si un proveedor no tiene zona, la migración **falla** (no se inventa polígono).
2. Copiar `weather_mode` y `service_manually_enabled` del proveedor a esa zona.
3. Poner `zone_id` de `pricing_configs` de esa empresa en esa zona.
4. Poner `zone_id` de todos los `schedules` de esa empresa en esa zona.
5. Poner `zone_id` de todos los `restaurant_delivery_providers` de esa empresa en esa zona.

Empresas con **más de una** zona previa (posible en DB, no usado por API): precios, horarios, clima y partnerships van a la principal; las zonas extra quedan con seed de tarifas/horarios default en un paso de backfill posterior en la misma migración (crear pricing+schedules default si les faltan), para que no queden zonas huérfanas de config.

### 4.7 Al crear una zona nueva

Seed, no clon de otra zona:

- `weather_mode = none`, `service_manually_enabled = true`.
- `default_pricing_config()` (incluye `max_distance_km = 20`).
- `seed_default_schedules` de esa zona (regular 09:00–21:00, night 21:00–22:00, todos los días).

## 5. Matching (solo Mexy)

Entrada: `latitude`, `longitude` del negocio.

Candidatos: zonas `is_active` de proveedores Mexy (`is_mexy_provider_slug`), con `boundary` NOT NULL y fila de pricing. No hay flujo de desactivar zona en esta entrega (solo borrar).

Para cada zona:

1. `distance_m = ST_Distance(boundary, punto)` en geography (metros). Dentro del polígono = `0`.
2. `distance_km = distance_m / 1000`.
3. Cubre si `distance_km <= pricing.outside_polygon.max_distance_km`.

Matching **no** llama a Distance Matrix: es distancia geodésica al polígono (barato en onboarding). La cotización al cliente **sigue** usando distancia de manejo, igual que hoy.

Ganador: menor `distance_km`. Empate: `priority ASC`, luego `created_at ASC`.

Si no hay candidatos: `null`. El servidor **nunca** crea partnership en ese caso.

El preview de onboarding y el alta del restaurante usan **la misma función**. El cliente no elige `zone_id`.

## 6. Flujos

### 6.1 Onboarding restaurante (`frontend`)

El paso `orderTypes` (delivery) ocurre **después** de ubicación.

1. Con lat/lng del wizard, `GET` preview de cobertura Mexy.
2. Hay match → tarjeta: Mexy Reparto + **nombre de zona**. Copy: se enviará solicitud a esa zona.
3. No hay match → empty state: no hay cobertura Mexy en esa ubicación; puede activar delivery y solicitar cuando exista zona. No se envía nada.
4. `POST /restaurants` con `delivery_enabled`:
   - El backend vuelve a matchear con las coordenadas guardadas.
   - Match → `ensure` crea `pending` con ese `zone_id`.
   - Sin match → restaurante creado, **cero** filas de partnership.

Si el usuario cambia la ubicación en un paso anterior y vuelve a delivery, se recalcula el preview.

### 6.2 Ajustes del restaurante

`syncRestaurantDeliveryPartnership` / `request_mexy_partnership` / enable delivery:

- Si **ya hay** partnership (pending/active/suspended): se devuelve tal cual. **No** se cambia `zone_id` aunque la ubicación ahora caiga en otra zona.
- Si **no hay** fila y `delivery_enabled`: matchear; crear `pending` solo si hay zona.
- Si no hay match: `partnership = null` (HTTP 200, no 400). Delivery puede seguir on.

Desactivar delivery no borra el partnership (comportamiento actual, sin cambio).

### 6.3 Courier: solicitudes y lista por zona

Aceptar / rechazar igual que hoy. El `zone_id` no cambia al aceptar.

Listados incluyen `zone: { id, name }`. Filtro `?zone_id=`.

Reasignar: `PATCH /delivery-providers/me/partnerships/{link_id}` body `{ "zone_id": "<uuid>" }`. Owner, admin y operator. La zona destino debe ser de la misma empresa que el link. Tras reasignar, la zona origen puede quedar vacía y entonces sí se puede borrar.

### 6.4 Cotización pública

`PublicDeliveryQuoteService` deja de usar `get_primary_zone` / `point_in_primary_zone` / horarios/clima/pause de empresa.

Para un restaurante con partnership **active** y `zone_id`:

- Pause y horario: de **esa** zona (`service_manually_enabled`, schedules de la zona, timezone de la empresa).
- Polígono y `max_distance_km`: de esa zona.
- Tarifas inside/outside y `weather_mode`: de esa zona.
- Noche / fuera de cerco: misma regla actual, evaluada con schedules de esa zona.

Sin `zone_id` en un active (no debería ocurrir post-migración): tratar como sin cobertura.

Horarios que el restaurante muestra en Ajustes (`/delivery-partnership/schedules`): schedules de **su** zona, no de otra.

### 6.5 Onboarding de la empresa de delivery

Sin cambio de producto: una zona inicial (nombre + polígono) como hoy. Esa zona recibe seed de precios/horarios/clima/pause.

## 7. API

Permisos: `can_write_provider_config` = owner|admin. `can_manage_weather` / `can_manage_partnerships` / pause = owner|admin|operator (igual que hoy, aplicados **por zona**).

### 7.1 Zonas (courier)

| Método | Ruta | Rol escritura | Notas |
|---|---|---|---|
| GET | `/delivery-providers/me/zones` | cualquier miembro | Todas las zonas de su empresa |
| POST | `/delivery-providers/me/zones` | owner/admin | Nombre + polígono; seed de config |
| GET | `/delivery-providers/me/zones/{zone_id}` | cualquier miembro | Incluye polígono |
| PATCH | `/delivery-providers/me/zones/{zone_id}` | owner/admin | Nombre y/o polígono |
| DELETE | `/delivery-providers/me/zones/{zone_id}` | owner/admin | Ver errores |

`GET /delivery-providers/me` deja de devolver solo `primary_zone`. Pasa a `zones: DeliveryProviderZoneDTO[]`. El dashboard deja de llamar update de perfil para editar el cerco.

`PATCH /delivery-providers/me` **deja de aceptar** `service_zone_name` / `service_zone_polygon`. Solo perfil de empresa (nombre, teléfonos, logo). El onboarding `POST /delivery-providers/onboarding` **sí** sigue mandando la primera zona (único momento en que zona viaja junto al alta).

### 7.2 Config por zona (query obligatorio `zone_id`)

| Recurso actual | Cambio |
|---|---|
| `GET/PUT /me/schedules` | Requiere `zone_id`. 404 si no es de la empresa |
| `GET/PUT /me/pricing` | Igual |
| `PATCH /me/pricing/weather-mode` | Igual; escribe `zones.weather_mode` |
| `POST /me/pricing/simulate` | Igual; simula tarifas de esa zona |
| `GET/PATCH /me/service-status` | Igual; pause y status de esa zona |

Sin `zone_id`: 400 `"Indica la zona"`.

### 7.3 Partnerships

- `GET /me/partnership-requests` y `GET /me/partnerships`: cada item incluye `zone`. Query opcional `zone_id`.
- `PATCH /me/partnerships/{link_id}`: reasignar zona.
- DTO restaurante (`RestaurantDeliveryPartnershipDTO`): agregar `zone_id`, `zone_name` (nullable si no hubiera, no esperado).

### 7.4 Preview y alta restaurante

- `GET /restaurants/mexy-coverage?latitude=&longitude=` (usuario autenticado, ruta de colección **antes** de `/{restaurant_id}`). Respuesta:

```json
{
  "zone": { "id": "...", "name": "Centro", "provider_name": "Mexy Reparto" },
  "distance_km": 0.4
}
```

o `{ "zone": null, "distance_km": null }`.

- `create_restaurant` / `request_mexy_partnership`: matching interno; no aceptan `zone_id` del cliente.

## 8. Errores

| Caso | HTTP | Mensaje |
|---|---|---|
| Nombre duplicado en la empresa (trim + case-insensitive) | 409 | Ya existe una zona con ese nombre |
| Borrar zona con partnerships | 409 | Reasigna {n} negocios antes de eliminar esta zona |
| Borrar la única zona de la empresa | 409 | Debes conservar al menos una zona |
| Operator POST/PATCH/DELETE zona o PUT tarifas/horarios | 403 | Tu rol no permite modificar esta configuración |
| `zone_id` de otra empresa o inexistente | 404 | Zona no encontrada |
| Falta `zone_id` en endpoints que lo requieren | 400 | Indica la zona |
| Preview sin lat/lng válidos | 400 | El negocio no tiene ubicación |
| Polígono inválido | 400 | mismos mensajes del cerco actual |
| Reasignar a zona de otra empresa | 404 | Zona no encontrada |

`{n}` es el conteo de filas `restaurant_delivery_providers` con ese `zone_id` (singular: `Reasigna 1 negocio antes de eliminar esta zona`).

## 9. UI

Tokens, Inter e iconos MUI actuales. No cambiar paleta ni tipografía. Iconos SVG (MUI), no emoji. `cursor-pointer` en chips y cards. Transiciones 150–300ms. Contraste de texto ≥ 4.5:1. Focus visible. `prefers-reduced-motion`. Empty states con título + acción, nunca pantalla en blanco.

### 9.1 `delivery-dashboard`

**Selector de zona** (Cerco, Tarifas, Horarios): chips horizontales bajo el título + **Agregar zona** (oculto para operator). Zona activa en `localStorage` (`delivery.selectedZoneId`). Al crear, se selecciona la nueva.

**Cerco:** editor actual (nombre + `ServiceZoneMapDrawer`) sobre la zona seleccionada. Borrar con confirmación; si hay negocios, el botón deshabilitado explica el conteo.

**Tarifas / Horarios:** pantallas actuales acotadas a `zone_id`. Clima operativo (lluvia) es de esa zona.

**Top bar pause:** select compacto de zona + switch. El punto verde/rojo es de la zona elegida. Pausar Centro no apaga Norte.

**Restaurantes:** tabs Pendientes / Activos. Filtro `Todas` + una chip por zona. Listas agrupadas con encabezado de zona. Cada tarjeta muestra el nombre de zona. Empty: “Nadie en esta zona todavía”.

**Operator:** ve selector y mapas/tarifas/horarios en solo lectura; puede clima, pause, aceptar/rechazar y reasignar.

### 9.2 `frontend` onboarding

Paso delivery: el switch se mantiene. Debajo, tarjeta de cobertura o empty de sin cobertura (sección 6.1). Sin selector de zona para el restaurante.

### 9.3 `frontend` ajustes

`DeliveryPartnershipStatus`: `Mexy Reparto · {zona}` cuando hay partnership. Si delivery on y `partnership === null`: copy de sin cobertura, no “solicitud pendiente de envío”.

## 10. Tests

Pytest, mismo estilo que `test_delivery_provider_onboarding.py`, `test_delivery_partnerships.py`, `test_public_delivery_quote_service.py`.

1. Backfill: partnership Mexy existente queda `active`/`pending` con `zone_id` de la zona principal; precios y horarios de esa zona.
2. POST zona con nombre `"Centro"` y luego `"centro"` → 409.
3. Match un candidato → esa zona; dos que cubren → la de menor `ST_Distance`; ninguno → `zone: null` y no inserta partnership.
4. Create restaurant `delivery_enabled=true` con match → `pending` + `zone_id`; sin match → 0 filas en `restaurant_delivery_providers`.
5. DELETE zona con negocios → 409; PATCH reasignar → DELETE 204; DELETE última zona → 409.
6. Quote de restaurante en zona Norte usa tarifas/horario/clima/pause de Norte, no de Centro.
7. Operator GET zonas 200; POST zona 403; PUT pricing 403; PATCH weather 200.
8. Restaurante Mexy ya activo sigue cotizando en el menú público después de la migración (regresión).
9. Enable delivery en ajustes sin cobertura → 200 y `partnership: null`.
10. Partnership existente no cambia de zona si el restaurante actualiza lat/lng.

## 11. Fuera de alcance

- Matching a empresas que no son Mexy (marketplace).
- El restaurante elige o se auto-mueve de zona.
- Horarios o tarifas “default de empresa” con override.
- Métodos de pago por zona.
- Timezone por zona.
- GPS / despacho de drivers.
- Clonar tarifas de otra zona al crear (solo seed default).
- Desactivar zona sin borrarla (`is_active = false`).
- Notificar al restaurante cuando Mexy abre una zona nueva que ahora lo cubre (puede pedir en Ajustes).

## 12. Criterio de hecho

- Owner/admin crea, edita y borra zonas (con las reglas de borrado) en `delivery-dashboard`.
- Cada zona tiene cerco, km máx., tarifas, horarios, clima y pause propios.
- Onboarding muestra como máximo una zona Mexy, la más cercana en rango; sin rango no hay solicitud.
- Courier ve y filtra restaurantes por zona.
- Restaurantes Mexy actuales siguen activos y cotizan con la zona heredada.

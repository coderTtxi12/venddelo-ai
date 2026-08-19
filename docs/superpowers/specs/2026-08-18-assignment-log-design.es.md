# Bitácora de asignación en el detalle del monitor

**Fecha:** 2026-08-18  
**Estado:** Diseño aprobado en chat — pendiente review del archivo antes del plan  
**Apps:** `backend/`, `delivery-dashboard/`

## 1. Objetivo

Al abrir **Detalle** de un pedido en `/monitor`, el operador ve por qué el motor automático no ha asignado (o por qué sí): hora de cada pasada, próxima búsqueda, y una frase humana + el motivo corto (offline, GPS viejo, más cercano al restaurante, etc.).

Cloud Tasks solo dispara el tick. Lo que se muestra es **lógica de negocio**, no nombres de tasks GCP ni Cloud Logging.

## 2. Decisiones

| Tema | Decisión |
|------|----------|
| Profundidad | Diario persistido de intentos (no snapshot-only, no GCP live). |
| Copy | Desenlace + por qué corto. Sin ranking de metros por rider. |
| Layout del drawer | Tres bloques: Solicitud (igual) → **Asignación** (nuevo) → Operación (igual). |
| Persistencia | Tabla nueva. El GET se hace **al abrir** el detalle, no en el poll del mapa. |
| Límite de lectura | Últimos **50** eventos, del más viejo al más nuevo. |
| Retención | Se queda con el pedido (también pedidos ya asignados/entregados). Sin prune en v1. |
| Idioma | Español, generado en el servidor con plantillas fijas. El front no arma frases. |
| Quién | Owner / admin / operador de la empresa dueña del pedido. |
| Tiempo en UI | `es-MX`, hora con segundos en la lista; countdown en la franja. |
| UI tokens | Los del `delivery-dashboard` actuales. Sin paleta ni fuente nuevas. |

## 3. Fuera de v1

- Consultar Cloud Tasks API o Cloud Logging.
- Ranking de riders (nombre + metros + sí/no).
- Página Historial / drawer de historial.
- Panel del restaurante.
- Gráficos.
- IDs internos, JSON crudo o `case A` suelto en pantalla (el caso va dentro de la frase).

## 4. Modelo de datos

Migración: `0059_assignment_events` (revisa `0058_dispatch_status_times`).

Tabla `delivery_dispatch_assignment_events`:

| Columna | Notas |
|---------|--------|
| `id` | UUID PK |
| `request_id` | FK `delivery_dispatch_requests.id`, ON DELETE CASCADE |
| `created_at` | timestamptz, default now |
| `kind` | `searched` \| `offered` \| `expired` \| `rejected` \| `timed_out` \| `manual` |
| `tone` | `ok` \| `wait` \| `warn` |
| `title` | frase corta, NOT NULL |
| `detail` | por qué, nullable (texto ya listo) |
| `next_attempt_at` | timestamptz nullable |
| `case_applied` | `A` \| `B` \| `C` \| `D` \| `M` nullable, no se pinta solo |
| `driver_id` | FK `delivery_drivers.id` ON DELETE SET NULL, nullable |

Índice: `(request_id, created_at)`.

Un tick del motor escribe **una** fila por cada pedido cuyo desenlace cambió en ese tick (el del task y hermanos ofertados o agrupados). No dos filas “buscó” + “ofertó” para el mismo pedido en el mismo tick: si ofertó, `kind=offered`.

## 5. Cuándo se escribe

| Momento | `kind` | Título (plantilla) |
|---------|--------|-------------------|
| Task `search` / `retry` y el motor **oferta** | `offered` | `Ofertó a {nombre}` |
| Task `search` / `retry` y **no** hay oferta | `searched` | `Buscó rider` |
| Task `expire_offer` y el rider no contestó | `expired` | `{nombre} no respondió` |
| Rider rechaza en la app | `rejected` | `{nombre} rechazó` |
| Se agota `assignment_timeout_seconds` | `timed_out` | `Se agotó la búsqueda` |
| Oferta manual desde el monitor | `manual` | `Oferta enviada a mano a {nombre}` |

`next_attempt_at` se llena cuando el pedido sigue en `searching` y hay reintento programado.

No se persisten nombres de cola GCP, HTTP status del handler, ni stack traces.

## 6. Copy del “por qué” (`detail`)

Plantillas fijas. Códigos de bloqueo → español (mismos códigos que el monitor hoy):

| Código | Texto |
|--------|--------|
| invited | invitado |
| blocked | bloqueado |
| offline | offline |
| gps | GPS viejo |
| offer | con oferta |
| rejected | rechazó antes |
| silent | sin respuesta |
| compartment | caja chica |
| packages | sin capacidad |
| credit | sin crédito |

**Sin oferta:**  
`Nadie elegible: {n} {texto}[, {n} {texto}…]`  
Si `high_demand` y nadie: añadir ` · alta demanda`.  
Si no hay riders en la empresa: `No hay repartidores dados de alta.`  
Si hay elegibles pero el motor no ofertó (p. ej. reserva `min_protected_drivers`): `Había riders, pero el motor no soltó oferta (reserva de libres).`

**Con oferta, según caso:**

| Caso | Detail |
|------|--------|
| A | `El más cercano al restaurante` |
| B | `Varios pedidos listos · riders en paralelo` |
| C | `Alta demanda · entregas cercanas, un rider` |
| D | `Alta demanda · rider que ya iba de camino` |
| M | `Asignación manual desde el monitor` |

Tras expire/reject, si sigue buscando: `Sigue buscando.` La hora del reintento va solo en `next_attempt_at` y en la franja, no en `detail`.

Nombre del rider: `first_name` de `delivery_drivers`. Si falta: `repartidor`.

## 7. API

`GET /api/v1/delivery-providers/me/dispatch-requests/{request_id}/assignment-log`

Auth igual que el monitor. 401 sin sesión. 403 si el user no es miembro de una empresa. 404 si el pedido no existe o no es de esa empresa.

No entra en `GET /dispatch-monitor`.

```json
{
  "request_id": "uuid",
  "last_search_at": "2026-08-19T05:04:01Z",
  "next_attempt_at": "2026-08-19T05:04:31Z",
  "assignment_timeout_at": "2026-08-19T05:19:00Z",
  "events": [
    {
      "id": "uuid",
      "at": "2026-08-19T05:04:01Z",
      "kind": "searched",
      "tone": "warn",
      "title": "Buscó rider",
      "detail": "Nadie elegible: 2 offline, 1 GPS viejo",
      "next_attempt_at": "2026-08-19T05:04:31Z"
    }
  ]
}
```

`last_search_at`: `created_at` del último evento `searched` u `offered`; si no hay, `search_at` del pedido cuando `status` ya no es `scheduled`, si no `null`.

`next_attempt_at` y `assignment_timeout_at`: de la fila del pedido (estado actual), no del último evento.

`events`: `created_at` ascendente, `limit 50` (los 50 más recientes, luego ordenados asc para pintar).

## 8. UI (`RequestDetailDrawer`)

Orden: Solicitud → **Asignación** → Operación.

**Franja (scheduler):**  
«Última búsqueda {hora}» · «Próxima en {countdown}» / «Próxima {hora}» · «Timeout {countdown}».  
Ocultar campos nulos. Pedido `scheduled`: «Empieza a buscar {hora}».  
`unassigned`: «Se agotó el tiempo de búsqueda» (sin próxima).

**Lista:** mismo patrón visual que Operación (hora tabular, punto, título + detail).  
Tono: azul vigente (último evento si el pedido sigue `searching`/`offered`), ámbar `warn`, verde `ok` (`offered`/`manual`). Color **y** texto (no solo color).

Vacío: «Aún no hay pasadas del motor.»

Carga: al `open && request`. Re-fetch si el socket del monitor dispara `monitor.updated` **y** el drawer de ese `request.id` sigue abierto. Keys: `event.id`.

Error del GET: `role="alert"`, «No se pudo cargar la asignación.» Solicitud y Operación siguen. Sin spinner bloqueante eterno (skeleton corto o el vacío + alerta).

a11y: heading `Asignación`, lista `ol`, `dateTime` en `<time>`, foco del drawer existente, `prefers-reduced-motion`, sin emojis.

Móvil: franja en 2 líneas; drawer `narrow` actual.

Historial (`HistoryDetailDrawer`): no en v1.

## 9. Errores y tiempo real

Escribir el evento **en la misma transacción** que el tick (mismo UoW/`session.commit` del handler). Si el insert falla, falla el tick (se reintenta Cloud Tasks); no hay bitácora huérfana a medias.

El GET nunca llama a GCP.

## 10. Tests

- Tick sin riders → `searched` + detail de bloqueos o “no hay repartidores” + `next_attempt_at`.
- Caso A → title con nombre, detail «El más cercano al restaurante».
- Expire → `{nombre} no respondió`.
- Timeout → `timed_out` / «Se agotó la búsqueda».
- GET: máximo 50; 404 de otra empresa.
- Drawer: pinta franja + eventos; el error del log no oculta Solicitud.

## 11. Archivos previstos

- `backend/migrations/versions/0059_assignment_events.py`
- `backend/app/db/models/delivery.py`
- `backend/app/modules/delivery_dispatch/assignment_log.py` (plantillas + insert)
- `backend/app/modules/delivery_dispatch/tasks.py` / `service.py` (puntos de escritura)
- `backend/app/modules/delivery_dispatch/schemas.py` + `api.py` o `ws.py` (GET)
- `delivery-dashboard/src/lib/api/deliveryProviders.ts`
- `delivery-dashboard/src/components/monitor/RequestDetailDrawer.tsx` (+ CSS)

## 12. Criterio de hecho

Un operador abre Detalle de un pedido en `searching`, ve cuándo buscó, cuándo vuelve a buscar, y una frase que entiende sin saber qué es Cloud Tasks ni el caso A/B/C/D.

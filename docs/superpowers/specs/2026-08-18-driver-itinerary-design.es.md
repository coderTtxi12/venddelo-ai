# Itinerario persistido del rider

> **Fecha:** 2026-08-18  
> **Apps:** `backend/`, `delivery-dashboard/` (`/monitor`), `apps/rider`

## 1. Objetivo

El asignador (automático o manual) fija el orden de paradas. App y `/monitor` leen la misma lista. Las calles se recalculan; el 1° / 2° / 3° no.

El rider no elige a qué punto ir primero.

## 2. Modelo

Tabla `delivery_driver_itinerary_stops`:

| Columna | Notas |
|---|---|
| `driver_id` | FK rider |
| `sequence` | 1-based, unique por rider |
| `kind` | `restaurant` \| `dropoff` |
| `request_id` | FK solicitud |

Unique `(driver_id, request_id, kind)`. Solo paradas **pendientes**. Al completar un paso se borra y se reenumera.

## 3. Cuándo se escribe

**Automático, al aceptar** (reconstruye según el caso de la oferta):

| Caso | Orden |
|---|---|
| A libre / B | Recoger → entregar (ese pedido) |
| A pre-free | Entrega actual restante → recoger nuevo → entregar nuevo |
| C | Recoger negocios (NN desde GPS) → entregar destinos (NN) |
| D | Recoger el nuevo **ahora** → paradas que ya tenía (mismo orden relativo) → entregar el nuevo |

**Manual `M`, al aceptar:** usa el orden que mandó `/monitor` en la oferta. Default si no hay orden: las paradas actuales del rider destino + recoger/entregar del pedido al final.

Al reasignar: se quitan las paradas de ese pedido del rider anterior.

**Avance:** `picked_up` quita `restaurant`; `delivered` / `cancelled` quita ambas restantes de ese `request_id`.

**PATCH** dispatcher: permutación de las paradas pendientes (drag en el panel).

## 4. API

- Monitor snapshot: `drivers[].itinerary: [{ sequence, kind, request_id, current }]`
- Rider profile: `itinerary` igual; `assignments` ordenados por primera aparición
- `POST .../manual-offer` body extra: `itinerary: [{ kind, request_id }]` (cola destino **después** de aceptar, incluyendo el pedido ofertado)
- `PATCH /delivery-providers/me/drivers/{id}/itinerary` `{ "stops": [{ kind, request_id }] }`

## 5. UI

- Drawer Asignar: al elegir rider, lista de pasos actuales + Recoger/Entregar del pedido; subir/bajar esos (y el resto) antes de enviar.
- Panel del mapa: drag de pasos pendientes → PATCH. App navega al `current` (sequence 1).

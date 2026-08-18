# Oferta manual desde el monitor

> **Fecha:** 2026-08-17  
> **Apps:** `delivery-dashboard/` (`/monitor`), `backend/`

## 1. Objetivo

El dispatcher puede enviar una oferta a un repartidor concreto desde `/monitor` cuando el motor falla (`unassigned`) o hay que cambiar de rider. El restaurante sigue usando el **mismo** link de rastreo (`tracking_token` no se regenera).

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Mecánica | Oferta (caso `M`), no asignación instantánea |
| Rider actual | Sigue asignado hasta que el nuevo **acepte** |
| Rechazo / expire | El pedido no cambia si ya tenía rider |
| Lista de riders | Todos los no bloqueados, con avisos (offline, GPS, crédito, compartimento, en ruta, oferta abierta) |
| Permiso | owner, admin, operador |
| Token de rastreo | Inmutable |

## 3. Comportamiento

Estados ofertables: `scheduled`, `searching`, `offered`, `unassigned`, `assigned`, `picked_up`, `in_transit`.  
No: `delivered`, `cancelled`.

- Si el pedido ya tiene oferta `offered`, se expira y se sustituye por la manual.
- Si el pedido está `assigned` / `picked_up` / `in_transit`, **no** se cambia el status al ofertar.
- Si está `unassigned` o en cola, el status pasa a `offered`. Al expire/reject: vuelve a `unassigned` si venía de ahí; si no, el motor reintenta (`searching`).
- Al aceptar: `assigned_driver_id` = nuevo rider, status `assigned` (el nuevo no ha recogido). Hold cash se **transfiere** en la misma fila (`request_id` es unique). Rastreo público muestra al nuevo.
- 409 si el rider destino ya tiene otra oferta `offered`.
- 400 si está bloqueado o es el asignado actual.

## 4. API

`POST /api/v1/delivery-providers/me/dispatch-requests/{id}/manual-offer`  
Body: `{ "driver_id": "<uuid>" }`  
Timeout: `offer_timeout_seconds`. FCM igual que el motor.

Migración `0055`: `case_applied` admite `'M'`.

## 5. UI `/monitor`

Botón **Asignar** en Cola, En curso y panel **Sin asignar**. Drawer derecho con ficha del pedido y lista de riders (foto + meta + avisos). Ofertas manuales se etiquetan **Manual**.

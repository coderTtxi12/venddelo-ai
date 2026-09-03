# Cotización fuera del polígono: ruta más corta (Routes API)

**Fecha:** 2026-09-03  
**Estado:** Aprobado

## Resumen

Fuera del polígono de cobertura, la cotización de envío debe usar los **km de la ruta de manejo más corta**, no la ruta “recomendada” (suele ser la más rápida). Dentro del polígono no hay cálculo por km. La app del repartidor no cambia.

## Decisiones

| Tema | Decisión |
|------|----------|
| Alcance | Solo cotización, solo fuera del polígono |
| API | Routes API `computeRoutes` (no Distance Matrix) |
| Modo | `DRIVE` + `TRAFFIC_UNAWARE` (SKU Essentials, auto, sin tráfico en vivo) |
| Preferencia | `requestedReferenceRoutes: ["SHORTER_DISTANCE"]` |
| App repartidor | No se modifica (sigue su ruta sugerida actual) |
| Tarifas / polígono / horario diurno | Sin cambios |

## Por qué no Distance Matrix

Distance Matrix (legacy) devuelve **una** distancia: la de la ruta recomendada. No tiene alternativas ni “más corta en km”.

## Comportamiento

1. `point_in_zone` igual que hoy.
2. Si está **dentro**: tarifa fija; no se llama a Google.
3. Si está **fuera**: POST a `https://routes.googleapis.com/directions/v2:computeRoutes` con la key existente (`GOOGLE_MAPS_API_KEY`).
4. Elegir `routes[].distanceMeters` de la ruta con label `SHORTER_DISTANCE`. Si no viene el label, usar el mínimo `distanceMeters` de las rutas devueltas.
5. Convertir a km (2 decimales) y aplicar el mismo tramo de tarifa.
6. Fallos de red / sin ruta: el mismo mensaje de cotización no disponible que hoy.

No usar `TRAFFIC_AWARE` ni `TWO_WHEELER` (suben a Pro / Enterprise). Incluir `routes.routeLabels` y `routes.routeToken` en el field mask porque Google lo exige para `SHORTER_DISTANCE`; no hace falta polyline.

## Fuera de alcance

- App rider (`apps/rider`), ruta sugerida, navegación.
- Matching de zona (geodésica al polígono).
- Cambiar brackets, max km, o copy de checkout más allá de que siga siendo “km de ruta”.

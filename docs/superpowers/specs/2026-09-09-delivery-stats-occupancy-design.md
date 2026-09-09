# Estadísticas: comparación, exclusiones y ocupación

**Fecha:** 2026-09-09
**Estado:** Aprobado en chat (ocupación concurrente, enrutados = 2+ pedidos, clientes por teléfono, periodos de igual duración)
**Ruta:** `/estadisticas`

## Objetivo

Que la empresa vea pedidos cerrados con comparación **manual** (mismo largo), pueda **excluir pruebas**, y vea **horas pico**, **ocupación máxima de repas** y **pedidos enrutados** (un repa con más de un pedido a la vez). Un GET agregado. Mobile first.

## Decisiones

| Tema | Decisión |
|------|----------|
| Retrieval | Un `GET /dispatch-stats`. Filtros en servidor. No paginar el historial en el cliente. |
| Comparación | Periodo A + B, **igual número de días**. Default B = periodo anterior automático. Query opcional `compare_start` / `compare_end`. Si el largo no coincide → 400. |
| Excluir | `exclude_restaurant_id`, `exclude_driver_id`, `exclude_customer_phone` (dígitos). Persistencia local en el dispositivo. |
| Cerrados | KPIs, mix, tops, tendencia, recent: `delivered` + `cancelled` en el rango (cierre CDMX). |
| Ocupación / enrutados | Pedidos **con repa asignado** cuya ventana ocupada **se solapa** con el periodo (no solo los que cerraron ese día). |
| Ventana ocupada | Inicio: aceptación de oferta (`responded_at`), si no `picked_up_at` / `in_transit_at` / `created_at`. Fin: `delivered_at` o `cancelled_at` o `updated_at`. |
| Ocupación máxima | Máximo de repas distintos con ≥1 pedido abierto a la vez. |
| Enrutados | Pedidos que en algún momento coincidieron con otro del mismo repa, o `dispatch_group_id` no nulo. |
| Horas pico | Solicitudes de negocios por `created_at` (cualquier estado, no solo cerradas). 1 día: barras 0–23. Más días: grilla hora × día (lun–dom) con **número en la celda**. KPI: hora con más solicitudes. |
| Tendencia | Área pedidos + barras apiladas entregados/cancelados (mismos buckets). |

## API

Query existente: `start`, `end`, `zone_id`.

Nueva:

- `compare_start`, `compare_end` (opcional)
- `exclude_restaurant_id` (lista)
- `exclude_driver_id` (lista)
- `exclude_customer_phone` (lista, dígitos)

`summary` agrega: `peak_hour` (`HH:00` o null), `peak_hour_count`, `peak_occupancy`, `peak_occupancy_change_pct`, `routed_order_count`, `routed_order_change_pct`, `stacked_rider_count`.

`series[]` agrega por bucket: `current_delivered_count`, `current_cancelled_count`, `previous_delivered_count`, `previous_cancelled_count`, `current_occupancy`, `previous_occupancy`, `current_routed`, `previous_routed`.

`hour_heatmap[]`: `{ weekday: 0–6` (lun=0), `hour: 0–23`, `count }` del periodo A.

## UI (mobile first)

- Chips de periodo A (igual que ahora), targets ≥ 44px, wrap.
- “Comparar con”: chip **Anterior** (default) o **Elegir…** + fechas de B. Texto: “Debe durar N días”.
- `<details>` **Excluir pruebas**: combobox negocios/repas (solo excluir) + chips de teléfono (`inputmode=tel`).
- KPIs: pedidos, entregados, cancelados, tarifas, ocupación máx., enrutados, hora pico. Cambio en texto (`+12%`).
- Gráficas: tendencia + apilado; horas pico; ocupación (línea actual vs B punteada); mix; tops.
- Filtros no recortan chips. Soft-refresh si ya hay datos.

## Errores

- B de distinto largo: mensaje “El periodo a comparar debe durar lo mismo (N días).”
- Vacío: “No hay pedidos cerrados en este periodo.”

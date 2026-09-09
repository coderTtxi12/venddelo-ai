# Estadísticas de despacho (delivery dashboard)

**Fecha:** 2026-09-09
**Estado:** Diseño aprobado en chat
**Ruta:** `/estadisticas` (redirect `/analytics` → `/estadisticas`)

## Objetivo

Que la empresa de delivery vea pedidos **cerrados** (entregados y cancelados) agregados por periodo, con comparación al periodo anterior, mix App web vs Pedido Manual, tops y gráficas. Los pedidos vivos siguen en Monitor.

## Decisiones

| Tema | Decisión |
|------|----------|
| Universo | Igual que Historial: `delivered` + `cancelled`. Cierre = `cancelled_at` o `updated_at`. |
| Zona | Mismo `zone_id` que Monitor/Historial (`Todas` = sin filtro). |
| Periodos UI | Hoy, Ayer, Antier, Semana (lun–dom), Mes calendario, Rango. Mexico City. |
| Comparación | Periodo anterior de igual duración justo antes. Si el rango es un mes calendario completo, comparar con el mes calendario anterior. |
| Fuente | `order_id` presente → App web; si no → Pedido Manual. |
| Tarifas / Mexy | Suma de `quoted_fee_cents` / `mexy_fee_cents` solo en **entregados**. |
| Lista | Últimos 12 del periodo. El resto en Historial. |
| Retrieval | Un GET agregado. No paginar todo el historial en el cliente. |
| Charts | Recharts. Tendencia = área/línea; mix = donut + leyenda; tops = barras horizontales. |

## API

`GET /api/v1/delivery-providers/me/dispatch-stats`

Query: `start`, `end` (`YYYY-MM-DD`), `zone_id` opcional.

Respuesta: `start`, `end`, `comparison_start`, `comparison_end`, `granularity` (`hourly` \| `daily` \| `weekly`), `summary` (conteos, % cancelación, tarifas, Mexy, web/manual, `%` vs anterior), `series`, `sources`, `top_restaurants`, `top_drivers`, `recent`.

Granularidad: 1 día → hora; 2–31 días → día; más → semana.

## UI

Mobile first. Chips de periodo como Historial. KPIs con cambio en texto (`+12%`), no solo color. Vacío: “No hay pedidos cerrados en este periodo.” Soft-refresh si ya hay datos.

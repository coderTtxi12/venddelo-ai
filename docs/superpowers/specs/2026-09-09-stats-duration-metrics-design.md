# Dispatch stats duration metrics

**Date:** 2026-09-09

## Goal

On Mexy `/estadisticas`, show how long delivered trips take, split by the real dispatch phases, for the selected period (and vs the comparison period). Also show how those averages move across the same hour/day/week buckets as the existing charts.

## Non-goals

- Median / p90 (v1 is arithmetic mean).
- Overlaying the previous period on the times chart.
- Per-restaurant or per-driver duration tables (existing rank charts stay count/earnings).
- Times for cancelled, unassigned, or in-flight requests.
- A new stats endpoint.
- Changing occupancy, heatmap, or closed-order counts.

## Decisions

- Extend `GET /delivery-providers/me/dispatch-stats`. Same period, zone, and exclusions.
- Only `status = 'delivered'` rows enter duration averages.
- If a required timestamp is missing or the delta is `<= 0`, that row is omitted from **that** metric only.
- Assignment time is `min(accepted offer.responded_at)` for the request (same source occupancy already uses). There is no `assigned_at` column.
- Chart series are **current period only**. KPI cards still show % vs the comparison period.
- Store API values as integer **seconds**. The dashboard formats minutes.

## Phases (locked)

```
created_at → search_at → accepted → picked_up_at → in_transit_at → delivered_at
 solicitar     buscar      va al        en el           en camino      entregado
                           negocio      restaurante
```

| Metric | Start | End | UI label | Hint |
|---|---|---|---|---|
| Total | `created_at` | `delivered_at` | Solicitar → entregar | Incluye espera de cocina |
| Searching | `search_at` | accepted offer `responded_at` | Buscando | Hasta asignar |
| Delivery | `search_at` | `delivered_at` | Buscar → entregar | Sin la espera previa a `search_at` |
| Pickup | accepted `responded_at` | `picked_up_at` | Recolección | Viaje al negocio |
| Dropoff | `in_transit_at` | `delivered_at` | Entrega | Viaje al cliente |

Time spent `picked_up` → `in_transit` (mostrador) is **not** a KPI.

## API

Add to `DispatchStatsSummaryDTO` (null when the sample is empty):

- `avg_total_seconds`, `avg_search_seconds`, `avg_delivery_seconds`, `avg_pickup_seconds`, `avg_dropoff_seconds`
- matching `*_change_pct` vs the comparison period (`stats_pct_change`)

Add to `DispatchStatsPointDTO` (current period only, null when the bucket has no sample):

- `avg_total_seconds`
- `avg_search_seconds`
- `avg_delivery_seconds`
- `avg_pickup_seconds`
- `avg_dropoff_seconds`

Closed-at bucketing stays as today (`closed_at` in Mexico City). A delivered order contributes its durations to the bucket when it **closed**, not when search started.

## Backend

New helpers in `backend/app/modules/delivery_dispatch/stats.py` (keep occupancy subquery style):

- `_accepted_at_expr()` — `min(DeliveryDispatchOffer.responded_at)` where `status = 'accepted'`.
- `_avg_seconds(start, end)` — `avg(extract(epoch, end - start))` filtered to delivered, both timestamps not null, and `end > start`.

Compute summary averages twice (current + previous closed filters). Compute series averages grouped with the existing `_series_bucket`. Do not put previous-period duration fields on each series point.

## Dashboard `/estadisticas`

Second KPI row under the existing cards, five cards:

1. Solicitar → entregar
2. Buscando
3. Buscar → entregar
4. Recolección
5. Entrega

Value: `formatDuration(seconds)` → `45 s` / `8 min` / `1 h 12 min`. Null → `—`. Change line same as other KPIs. Hint text from the table above so meaning is not color-only.

New wide card **Tiempos** after Horas pico (before Ocupación):

- Same granularity subtitle as Tendencia (`Por hora` / `Por día` / `Por semana`).
- Multi-line Recharts chart (`StatsDurationChart`), Y in minutes.
- Five named series, distinct colors **and** labels in the legend.
- Legend items are toggles (`aria-pressed`). Default: all five on.
- Tooltip: bucket label + visible series as formatted durations.
- Empty: `No hay entregas con tiempos en este periodo.`

Reuse `StatsPage.module.css` tokens (cards, KPI row, legend). Do not introduce a new palette system.

## Error / empty

- Zero delivered in the period: duration KPIs `—`, change `—` or `0%` following existing `stats_pct_change` rules, chart empty state.
- Partial timestamps (legacy rows): drop only the broken metric.
- Chart toggle that hides every series: show the empty state, not a blank plot.

## Testing

- Backend module tests: given delivered rows with known timestamps, averages match; cancelled rows ignored; `end <= start` ignored; series bucket gets the duration on the close hour/day.
- Dashboard: `formatDuration` unit tests; optional mapping test that series minutes come from seconds.
- Existing occupancy/count stats tests must stay green.

## Out of copy

Do not mention billing, weekly fee, or hold. This card is only operational time.

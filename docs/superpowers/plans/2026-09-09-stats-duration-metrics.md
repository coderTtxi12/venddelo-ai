# Stats Duration Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show average delivered-trip times on Mexy `/estadisticas` (five phase KPIs + a current-period line chart), using the existing dispatch-stats endpoint.

**Architecture:** Compute SQL `avg(epoch)` per phase on `status='delivered'` rows inside `list_dispatch_stats`. Assignment time is `min(accepted offer.responded_at)`. Summary carries vs-previous `%`; series points carry current-period averages only. Dashboard formats seconds and renders a toggleable five-line chart.

**Tech Stack:** FastAPI/SQLAlchemy, Next.js delivery-dashboard, Recharts, pytest, `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-09-stats-duration-metrics-design.md`

## Global Constraints

- Work on the **current git branch**. Do not create another branch.
- **Do not commit** and do not `git push`. Skip every “Commit” step.
- Arithmetic mean only (not median/p90).
- Only `status='delivered'` rows enter averages.
- Missing timestamp or `end <= start` → omit that row from **that** metric only.
- Chart is current period only (no previous overlay).
- API values are integer seconds; UI formats duration.
- Do not mention billing, weekly fee, or hold.
- Do not add a new stats endpoint.
- Longer time is worse: duration KPI `%` uses inverted colors (increase amber, decrease green). Text stays `+12%` / `-8%`.
- `*_change_pct` is `None` if current **or** previous sample for that metric is `None`.

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/modules/delivery_dispatch/stats.py` | Duration SQL + wire into summary/series |
| `backend/app/modules/delivery_dispatch/schemas.py` | DTO fields |
| `backend/tests/modules/test_dispatch_stats_durations.py` | Round/change-pct + SQL helper tests |
| `delivery-dashboard/src/lib/api/types.ts` | TS types |
| `delivery-dashboard/src/lib/dispatch/statsView.ts` | `formatDuration`, series mapping, metric meta |
| `delivery-dashboard/src/lib/dispatch/statsView.test.ts` | Duration format/mapping tests |
| `delivery-dashboard/src/components/stats/StatsDurationChart.tsx` | Multi-line chart + legend toggles |
| `delivery-dashboard/src/components/stats/StatsDurationChart.module.css` | Chart styles (copy from trend tooltip) |
| `delivery-dashboard/src/components/pages/StatsPage.tsx` | KPI row + Tiempos card |

---

### Task 1: Backend duration averages

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/stats.py`
- Modify: `backend/app/modules/delivery_dispatch/schemas.py` (`DispatchStatsSummaryDTO`, `DispatchStatsPointDTO`)
- Test: `backend/tests/modules/test_dispatch_stats_durations.py`

**Interfaces:**
- Consumes: `_closed_filters`, `_series_bucket`, `_aligned_series`, `_build_summary`, `stats_pct_change`, `DeliveryDispatchOffer`
- Produces: `_round_avg_seconds`, `_empty_durations`, `_duration_change_pcts`, `_accepted_at_expr`, `_period_durations`, `_duration_series`

Duration keys (exact names): `avg_total_seconds`, `avg_search_seconds`, `avg_delivery_seconds`, `avg_pickup_seconds`, `avg_dropoff_seconds`. Change keys: each plus `_change_pct`.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/modules/test_dispatch_stats_durations.py`:

```python
from app.modules.delivery_dispatch.stats import (
    _duration_change_pcts,
    _empty_durations,
    _round_avg_seconds,
)


def test_round_avg_seconds_none_and_int():
    assert _round_avg_seconds(None) is None
    assert _round_avg_seconds(90.4) == 90
    assert _round_avg_seconds(90.6) == 91


def test_empty_durations_are_all_none():
    empty = _empty_durations()
    assert empty == {
        "avg_total_seconds": None,
        "avg_search_seconds": None,
        "avg_delivery_seconds": None,
        "avg_pickup_seconds": None,
        "avg_dropoff_seconds": None,
    }


def test_duration_change_pct_none_if_either_sample_missing():
    current = {**_empty_durations(), "avg_total_seconds": 120}
    previous = _empty_durations()
    pcts = _duration_change_pcts(current, previous)
    assert pcts["avg_total_seconds_change_pct"] is None


def test_duration_change_pct_uses_stats_pct_change():
    current = {**_empty_durations(), "avg_total_seconds": 120}
    previous = {**_empty_durations(), "avg_total_seconds": 100}
    pcts = _duration_change_pcts(current, previous)
    assert pcts["avg_total_seconds_change_pct"] == 20.0
```

- [ ] **Step 2: Run tests — expect FAIL** (imports missing)

Run: `cd backend && .venv/bin/pytest tests/modules/test_dispatch_stats_durations.py -q`

- [ ] **Step 3: Implement helpers + SQL + DTO + wiring**

In `schemas.py`, add to `DispatchStatsSummaryDTO` (all `int | None = None` / `float | None = None`):

```python
avg_total_seconds: int | None = None
avg_search_seconds: int | None = None
avg_delivery_seconds: int | None = None
avg_pickup_seconds: int | None = None
avg_dropoff_seconds: int | None = None
avg_total_seconds_change_pct: float | None = None
avg_search_seconds_change_pct: float | None = None
avg_delivery_seconds_change_pct: float | None = None
avg_pickup_seconds_change_pct: float | None = None
avg_dropoff_seconds_change_pct: float | None = None
```

Add to `DispatchStatsPointDTO`:

```python
avg_total_seconds: int | None = None
avg_search_seconds: int | None = None
avg_delivery_seconds: int | None = None
avg_pickup_seconds: int | None = None
avg_dropoff_seconds: int | None = None
```

In `stats.py` (`case` and `extract` are already imported):

```python
_DURATION_KEYS = (
    "avg_total_seconds",
    "avg_search_seconds",
    "avg_delivery_seconds",
    "avg_pickup_seconds",
    "avg_dropoff_seconds",
)


def _round_avg_seconds(value: object) -> int | None:
    if value is None:
        return None
    return int(round(float(value)))


def _empty_durations() -> dict[str, int | None]:
    return {key: None for key in _DURATION_KEYS}


def _duration_change_pcts(
    current: dict[str, int | None],
    previous: dict[str, int | None],
) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for key in _DURATION_KEYS:
        cur = current.get(key)
        prev = previous.get(key)
        if cur is None or prev is None:
            out[f"{key}_change_pct"] = None
        else:
            out[f"{key}_change_pct"] = stats_pct_change(cur, prev)
    return out


def _accepted_at_expr():
    return (
        select(func.min(DeliveryDispatchOffer.responded_at))
        .where(
            DeliveryDispatchOffer.request_id == DeliveryDispatchRequest.id,
            DeliveryDispatchOffer.status == "accepted",
        )
        .correlate(DeliveryDispatchRequest)
        .scalar_subquery()
    )


def _avg_positive_epoch(start, end):
    delivered = DeliveryDispatchRequest.status == "delivered"
    return func.avg(
        case(
            (
                delivered & start.is_not(None) & end.is_not(None) & (end > start),
                extract("epoch", end - start),
            ),
            else_=None,
        )
    )


def _duration_select_columns():
    accepted = _accepted_at_expr()
    return (
        _avg_positive_epoch(DeliveryDispatchRequest.created_at, DeliveryDispatchRequest.delivered_at),
        _avg_positive_epoch(DeliveryDispatchRequest.search_at, accepted),
        _avg_positive_epoch(DeliveryDispatchRequest.search_at, DeliveryDispatchRequest.delivered_at),
        _avg_positive_epoch(accepted, DeliveryDispatchRequest.picked_up_at),
        _avg_positive_epoch(DeliveryDispatchRequest.in_transit_at, DeliveryDispatchRequest.delivered_at),
    )


def _row_to_durations(row) -> dict[str, int | None]:
    return {
        key: _round_avg_seconds(value)
        for key, value in zip(_DURATION_KEYS, row, strict=True)
    }


def _period_durations(session: Session, filters: list) -> dict[str, int | None]:
    row = session.execute(select(*_duration_select_columns()).where(*filters)).one()
    return _row_to_durations(row)


def _duration_series(
    session: Session,
    filters: list,
    granularity: StatsGranularity,
) -> dict:
    bucket = _series_bucket(granularity)
    rows = session.execute(
        select(bucket, *_duration_select_columns()).where(*filters).group_by(bucket).order_by(bucket)
    ).all()
    keyed: dict = {}
    for key, *values in rows:
        if key is None:
            continue
        payload = _row_to_durations(values)
        if granularity == "hourly":
            keyed[int(key)] = payload
        elif granularity == "daily":
            keyed[key] = payload
        else:
            keyed[key.date() if hasattr(key, "date") else key] = payload
    return keyed
```

Update `_empty_bucket` duration keys as `None` (not `0`).

Update `_aligned_series` to take `durations_current: dict` and merge `{k: cur_durations.get(k) for k in _DURATION_KEYS}` into each point.

Update `_build_summary` to accept `current_durations` and `previous_durations` and spread them plus `_duration_change_pcts(...)`.

In `list_dispatch_stats` call `_period_durations` twice (current + previous filters) and `_duration_series` once (current only). Pass into `_build_summary` / `_aligned_series`.

- [ ] **Step 4: Re-run duration tests + period tests**

Run: `cd backend && .venv/bin/pytest tests/modules/test_dispatch_stats_durations.py tests/modules/test_dispatch_stats_period.py -q`

Expected: PASS.

- [ ] **Step 5: Do not commit**

---

### Task 2: `formatDuration` + series mapping

**Files:**
- Modify: `delivery-dashboard/src/lib/api/types.ts`
- Modify: `delivery-dashboard/src/lib/dispatch/statsView.ts`
- Test: `delivery-dashboard/src/lib/dispatch/statsView.test.ts`

**Interfaces:**
- Consumes: API seconds fields
- Produces: `formatDuration`; `DURATION_METRICS`; `statsDurationPoints`

- [ ] **Step 1: Write failing tests** in `statsView.test.ts`:

```javascript
test('formatDuration uses seconds, minutes, and hours', () => {
  assert.equal(formatDuration(null), '—');
  assert.equal(formatDuration(45), '45 s');
  assert.equal(formatDuration(480), '8 min');
  assert.equal(formatDuration(4320), '1 h 12 min');
});

test('statsDurationPoints converts seconds to minutes for the chart', () => {
  assert.deepEqual(
    statsDurationPoints([
      {
        label: '09:00',
        avg_total_seconds: 600,
        avg_search_seconds: 120,
        avg_delivery_seconds: 480,
        avg_pickup_seconds: 180,
        avg_dropoff_seconds: 240,
      },
    ]),
    [
      {
        label: '09:00',
        total: 10,
        search: 2,
        delivery: 8,
        pickup: 3,
        dropoff: 4,
      },
    ],
  );
});
```

Minutes = `seconds / 60` (float). Null seconds → `null`.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd delivery-dashboard && ../frontend/node_modules/.bin/tsx --test src/lib/dispatch/statsView.test.ts`

- [ ] **Step 3: Implement**

Add the ten summary fields and five series fields on the TS types (`number | null`).

```ts
export const DURATION_METRICS = [
  { key: 'total', secondsKey: 'avg_total_seconds', changeKey: 'avg_total_seconds_change_pct', label: 'Solicitar → entregar', hint: 'Incluye espera de cocina', color: '#0f766e' },
  { key: 'search', secondsKey: 'avg_search_seconds', changeKey: 'avg_search_seconds_change_pct', label: 'Buscando', hint: 'Hasta asignar', color: '#d97706' },
  { key: 'delivery', secondsKey: 'avg_delivery_seconds', changeKey: 'avg_delivery_seconds_change_pct', label: 'Buscar → entregar', hint: 'Sin la espera previa a buscar', color: '#2563eb' },
  { key: 'pickup', secondsKey: 'avg_pickup_seconds', changeKey: 'avg_pickup_seconds_change_pct', label: 'Recolección', hint: 'Viaje al negocio', color: '#7c3aed' },
  { key: 'dropoff', secondsKey: 'avg_dropoff_seconds', changeKey: 'avg_dropoff_seconds_change_pct', label: 'Entrega', hint: 'Viaje al cliente', color: '#db2777' },
] as const;

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const value = Math.max(0, Math.round(seconds));
  if (value < 60) return `${value} s`;
  if (value < 3600) return `${Math.round(value / 60)} min`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.round((value % 3600) / 60);
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export function statsDurationPoints(
  series: Array<{
    label: string;
    avg_total_seconds?: number | null;
    avg_search_seconds?: number | null;
    avg_delivery_seconds?: number | null;
    avg_pickup_seconds?: number | null;
    avg_dropoff_seconds?: number | null;
  }>,
) {
  return series.map((point) => ({
    label: point.label,
    total: point.avg_total_seconds == null ? null : point.avg_total_seconds / 60,
    search: point.avg_search_seconds == null ? null : point.avg_search_seconds / 60,
    delivery: point.avg_delivery_seconds == null ? null : point.avg_delivery_seconds / 60,
    pickup: point.avg_pickup_seconds == null ? null : point.avg_pickup_seconds / 60,
    dropoff: point.avg_dropoff_seconds == null ? null : point.avg_dropoff_seconds / 60,
  }));
}
```

- [ ] **Step 4: Re-run statsView tests** — Expected: PASS.

- [ ] **Step 5: Do not commit**

---

### Task 3: `StatsDurationChart`

**Files:**
- Create: `delivery-dashboard/src/components/stats/StatsDurationChart.tsx`
- Create: `delivery-dashboard/src/components/stats/StatsDurationChart.module.css`

**Interfaces:**
- Consumes: `statsDurationPoints` shape; `DURATION_METRICS`; `formatDuration`
- Produces: legend toggles `aria-pressed`; empty copy `No hay entregas con tiempos en este periodo.`

- [ ] **Step 1: Implement the component** (mapping tests already cover data shape).

Copy tooltip chrome from `StatsTrendChart.module.css` (`.wrap`, `.tooltip`, `.empty`). Legend toggles: `min-height: 2.25rem`, swatch + label (not color-only).

Client component with `hidden: Set<string>` of metric `key`. Each legend control: `aria-pressed={!hidden.has(key)}`. Recharts `Line` per visible key. YAxis is minutes (`allowDecimals`). Tooltip uses `formatDuration(Math.round(minutes * 60))`. `connectNulls={false}`.

Empty when every series is hidden **or** no visible point has a non-null value: `No hay entregas con tiempos en este periodo.`

- [ ] **Step 2: Do not commit**

---

### Task 4: Stats page KPIs + Tiempos card

**Files:**
- Modify: `delivery-dashboard/src/components/pages/StatsPage.tsx`
- Modify: `delivery-dashboard/src/components/pages/StatsPage.module.css` — `.kpis + .kpis { margin-top: 0.75rem; }`

**Interfaces:**
- Consumes: `summary.avg_*`, `DURATION_METRICS`, `formatDuration`, `StatsDurationChart`, `statsDurationPoints`
- Produces: five duration KPI cards; Tiempos card after Horas pico, before Ocupación

- [ ] **Step 1: Inverted duration change class**

```tsx
function durationChangeClass(pct: number | null | undefined): string {
  const tone = statsChangeTone(pct);
  if (tone === 'up') return styles.down;
  if (tone === 'down') return styles.up;
  return styles.flat;
}
```

- [ ] **Step 2: Second `<dl className={styles.kpis}>` after the existing KPI list**

Map `DURATION_METRICS`: label, `formatDuration(summary[secondsKey])`, `formatChangePct` + `durationChangeClass`, hint.

- [ ] **Step 3: Insert Tiempos card** after Horas pico, before Ocupación:

```tsx
<article className={`${styles.card} ${styles.wide}`}>
  <header className={styles.cardHeader}>
    <h2 className={styles.cardTitle}>Tiempos</h2>
    <p className={styles.cardSubtitle}>
      Promedio de entregas · {statsGranularityLabel(stats.granularity).toLowerCase()}
    </p>
  </header>
  <StatsDurationChart data={statsDurationPoints(stats.series)} />
</article>
```

Duration KPIs stay visible even when the charts empty-state shows (no closed orders → `—`).

- [ ] **Step 4: Do not commit**

---

## Verification (after all tasks)

- `cd backend && .venv/bin/pytest tests/modules/test_dispatch_stats_durations.py tests/modules/test_dispatch_stats_period.py -q`
- `cd delivery-dashboard && ../frontend/node_modules/.bin/tsx --test src/lib/dispatch/statsView.test.ts`
- Browser `/estadisticas`: Hoy → five duration KPIs; Tiempos chart; toggle a legend item; worse times vs previous period show amber, not green.

## Spec coverage

| Spec item | Task |
|-----------|------|
| Five phase averages + change pct | 1, 4 |
| Series current-period only | 1, 3 |
| Integer seconds / UI format | 1, 2 |
| Cancelled / bad deltas omitted | 1 (`_avg_positive_epoch`) |
| KPI copy + hints | 2, 4 |
| Tiempos chart + legend toggles | 3, 4 |
| Empty states | 3, 4 |
| Longer is worse (inverted colors) | 4 |

# Analytics Global Period Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover Diario/Semanal/Mensual a un selector de periodo global en el header de `/analytics`, con presets legibles, rango personalizado, y soft refresh sin vaciar el dashboard.

**Architecture:** Backend expone `preset` (`7d|4w|12m|custom`) + `start`/`end` opcionales; el servicio calcula bounds/comparación/buckets en timezone del restaurante. Frontend usa `AnalyticsPeriodControl` + popover con `react-day-picker`, hook con `loading` vs `refreshing`, y URL query sync.

**Tech Stack:** FastAPI/Pydantic, SQLAlchemy (sin cambios de repo), Next.js 16 React 19, CSS modules, `react-day-picker`, `date-fns`

**Spec:** `docs/superpowers/specs/2026-07-20-analytics-global-period-selector-design.es.md`

## Global Constraints

- Labels UI: **Últimos 7 días / Últimas 4 semanas / Últimos 12 meses / Personalizado**
- Comparación custom: periodo anterior de **igual duración**
- Buckets custom: ≤31 días → `daily`; ≤90 días → `weekly`; else → `monthly`
- Duración custom máxima: **366 días** inclusive
- Errores custom: `400` con mensaje claro en español
- Compat: `granularity=daily|weekly|monthly` mapea a `7d|4w|12m` si `preset` ausente
- Default preset: `12m`
- Soft refresh: no pantalla vacía si ya hay `data`
- UI copy en español; código/comentarios en inglés
- Reutilizar tokens CSS del panel (`--color-primary`, borders, surfaces); sin tipografía nueva
- A11y: `role="tablist"`, `aria-selected`, focus visible, `cursor-pointer`, sin emojis como iconos
- Fuera de alcance v1: export, año pasado, delivery-dashboard stub, persistir último periodo

## File Map

| File | Responsibility |
|------|----------------|
| `backend/app/modules/analytics/schemas.py` | `AnalyticsPreset`, `period.preset` |
| `backend/app/modules/analytics/service.py` | `_resolve_period`, `_custom_chart_granularity`, presets + custom bounds |
| `backend/app/modules/analytics/api.py` | Query params `preset`, `start`, `end`, compat `granularity` |
| `backend/tests/modules/test_analytics_period.py` | Unit tests periodo (sin DB) |
| `frontend/src/lib/analytics/period.ts` | Tipos, labels, URL helpers, chart granularity display |
| `frontend/src/lib/analytics/period.test.ts` | Tests utilidades periodo |
| `frontend/src/lib/api/analytics.ts` | Tipos + `getRestaurantAnalytics({ preset, start?, end? })` |
| `frontend/src/hooks/useRestaurantAnalytics.ts` | Fetch por preset/rango, loading/refreshing |
| `frontend/src/components/analytics/AnalyticsPeriodControl.tsx` | Segmented control global |
| `frontend/src/components/analytics/AnalyticsDateRangePopover.tsx` | Calendario rango + Aplicar |
| `frontend/src/components/analytics/AnalyticsPeriodControl.module.css` | Estilos control + popover |
| `frontend/src/components/pages/AnalyticsPage.tsx` | Integración header, quitar tabs del chart |
| `frontend/src/components/pages/AnalyticsPage.module.css` | Layout header responsive |

---

### Task 1: Backend period resolution (presets + custom)

**Files:**
- Modify: `backend/app/modules/analytics/schemas.py`
- Modify: `backend/app/modules/analytics/service.py`
- Create: `backend/tests/modules/test_analytics_period.py`

**Interfaces:**
- Produces:
  - `AnalyticsPreset = Literal["7d", "4w", "12m", "custom"]`
  - `AnalyticsPeriod.preset: AnalyticsPreset`
  - `resolve_analytics_period(*, preset, timezone, start_date?, end_date?, now?) -> ResolvedAnalyticsPeriod`
  - `ResolvedAnalyticsPeriod` fields: `period_start`, `period_end`, `comparison_start`, `comparison_end`, `label`, `chart_granularity: AnalyticsGranularity`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/modules/test_analytics_period.py`:

```python
from datetime import UTC, datetime

import pytest

from app.core.exceptions import ValidationError
from app.modules.analytics.service import resolve_analytics_period


NOW = datetime(2026, 3, 18, 15, 0, tzinfo=UTC)
TZ = "America/Mexico_City"


def test_preset_7d_label_and_bounds():
    resolved = resolve_analytics_period(preset="7d", timezone=TZ, now=NOW)
    assert resolved.label == "Últimos 7 días"
    assert resolved.chart_granularity == "daily"
    assert resolved.period_end.astimezone().date().isoformat() == "2026-03-18"


def test_preset_4w_label():
    resolved = resolve_analytics_period(preset="4w", timezone=TZ, now=NOW)
    assert resolved.label == "Últimas 4 semanas"
    assert resolved.chart_granularity == "weekly"


def test_preset_12m_label():
    resolved = resolve_analytics_period(preset="12m", timezone=TZ, now=NOW)
    assert resolved.label == "Últimos 12 meses"
    assert resolved.chart_granularity == "monthly"


def test_custom_range_label_and_comparison_same_duration():
    resolved = resolve_analytics_period(
        preset="custom",
        timezone=TZ,
        start_date="2026-03-03",
        end_date="2026-03-18",
        now=NOW,
    )
    assert "3 mar" in resolved.label.lower() or "mar 2026" in resolved.label.lower()
    current_days = (resolved.period_end - resolved.period_start).days
    comparison_days = (resolved.comparison_end - resolved.comparison_start).days
    assert current_days == comparison_days
    assert resolved.chart_granularity == "daily"


def test_custom_chart_granularity_weekly_for_60_days():
    resolved = resolve_analytics_period(
        preset="custom",
        timezone=TZ,
        start_date="2026-01-18",
        end_date="2026-03-18",
        now=NOW,
    )
    assert resolved.chart_granularity == "weekly"


def test_custom_rejects_future_end():
    with pytest.raises(ValidationError, match="futuro"):
        resolve_analytics_period(
            preset="custom",
            timezone=TZ,
            start_date="2026-03-01",
            end_date="2026-03-25",
            now=NOW,
        )


def test_custom_rejects_range_over_366_days():
    with pytest.raises(ValidationError, match="366"):
        resolve_analytics_period(
            preset="custom",
            timezone=TZ,
            start_date="2025-01-01",
            end_date="2026-03-18",
            now=NOW,
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/modules/test_analytics_period.py -v`  
Expected: FAIL (`ImportError` or `resolve_analytics_period` not defined)

- [ ] **Step 3: Implement period resolution**

In `schemas.py` add:

```python
AnalyticsPreset = Literal["7d", "4w", "12m", "custom"]

class AnalyticsPeriod(BaseModel):
    preset: AnalyticsPreset
    granularity: AnalyticsGranularity  # chart bucket granularity
    ...
```

In `service.py`:
- Rename/refactor `_period_bounds(granularity, ...)` into preset branches `7d|4w|12m` (reuse existing math).
- Add `resolve_analytics_period(...)` dataclass return.
- Custom: parse `YYYY-MM-DD` in restaurant TZ; `local_start` 00:00:00, `local_end` 23:59:59.999999.
- Comparison: shift back by inclusive day count `(end - start).days + 1`.
- `_custom_chart_granularity(days)`: `<=31 -> daily`, `<=90 -> weekly`, else `monthly`.
- Custom label: `"{d} {mon} {year} – {d} {mon} {year}"` es-MX abbrev months.
- Raise `ValidationError("La fecha final no puede ser futura.")`, etc.

Update `get_dashboard` signature:

```python
def get_dashboard(
    self,
    restaurant_id: uuid.UUID,
    *,
    preset: AnalyticsPreset = "12m",
    start_date: str | None = None,
    end_date: str | None = None,
    granularity: AnalyticsGranularity | None = None,  # deprecated compat
) -> AnalyticsDashboard:
```

Compat mapping when `granularity` provided and no explicit preset override:
- `daily -> 7d`, `weekly -> 4w`, `monthly -> 12m`

Use `resolved.chart_granularity` for `get_sales_series(...)`.

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/modules/test_analytics_period.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/analytics/schemas.py backend/app/modules/analytics/service.py backend/tests/modules/test_analytics_period.py
git commit -m "feat(analytics): add preset and custom period resolution"
```

---

### Task 2: Backend API query params

**Files:**
- Modify: `backend/app/modules/analytics/api.py`

**Interfaces:**
- Consumes: `AnalyticsService.get_dashboard(preset, start_date, end_date, granularity)`
- Produces: `GET /restaurants/{id}/analytics?preset=7d|4w|12m|custom&start=&end=`

- [ ] **Step 1: Update endpoint**

```python
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

@router.get("/restaurants/{restaurant_id}/analytics", response_model=AnalyticsDashboard)
def get_restaurant_analytics(
    preset: AnalyticsPreset = Query(default="12m"),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    granularity: AnalyticsGranularity | None = Query(default=None),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AnalyticsService = Depends(_service),
) -> AnalyticsDashboard:
    return service.get_dashboard(
        restaurant.id,
        preset=preset,
        start_date=start.isoformat() if start else None,
        end_date=end.isoformat() if end else None,
        granularity=granularity,
    )
```

- [ ] **Step 2: Manual smoke via existing app**

Run: `cd backend && pytest tests/modules/test_analytics_period.py -v`  
Expected: PASS (service still covered)

- [ ] **Step 3: Commit**

```bash
git add backend/app/modules/analytics/api.py
git commit -m "feat(analytics): expose preset and custom date query params"
```

---

### Task 3: Frontend dependencies + API client

**Files:**
- Modify: `frontend/package.json` (+ lockfile)
- Modify: `frontend/src/lib/api/analytics.ts`

**Interfaces:**
- Produces:
  - `type AnalyticsPreset = '7d' | '4w' | '12m' | 'custom'`
  - `type AnalyticsPeriodQuery = { preset: AnalyticsPreset; start?: string; end?: string }`
  - `getRestaurantAnalytics(token, restaurantId, query: AnalyticsPeriodQuery)`

- [ ] **Step 1: Install date picker deps**

Run: `cd frontend && npm install react-day-picker date-fns`

- [ ] **Step 2: Update API types and fetch**

```typescript
export type AnalyticsPreset = '7d' | '4w' | '12m' | 'custom';

export type AnalyticsPeriodQuery = {
  preset: AnalyticsPreset;
  start?: string;
  end?: string;
};

export type AnalyticsPeriod = {
  preset: AnalyticsPreset;
  granularity: AnalyticsGranularity;
  timezone: string;
  start: string;
  end: string;
  comparison_start: string;
  comparison_end: string;
  label: string;
};

export function getRestaurantAnalytics(
  token: string,
  restaurantId: string,
  query: AnalyticsPeriodQuery,
) {
  const params = new URLSearchParams({ preset: query.preset });
  if (query.preset === 'custom') {
    if (query.start) params.set('start', query.start);
    if (query.end) params.set('end', query.end);
  }
  return apiRequest<AnalyticsDashboard>(
    `/restaurants/${restaurantId}/analytics?${params}`,
    { token },
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/api/analytics.ts
git commit -m "feat(analytics): add preset query types and API client"
```

---

### Task 4: Frontend period utilities + tests

**Files:**
- Create: `frontend/src/lib/analytics/period.ts`
- Create: `frontend/src/lib/analytics/period.test.ts`

**Interfaces:**
- Produces:
  - `ANALYTICS_PRESET_OPTIONS` (label + value)
  - `DEFAULT_ANALYTICS_PERIOD`
  - `parseAnalyticsPeriodSearchParams(searchParams: URLSearchParams)`
  - `buildAnalyticsPeriodSearchParams(query: AnalyticsPeriodQuery)`
  - `formatCustomRangeLabel(start: string, end: string)` for tab Personalizado

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildAnalyticsPeriodSearchParams,
  formatCustomRangeLabel,
  parseAnalyticsPeriodSearchParams,
} from './period';

describe('parseAnalyticsPeriodSearchParams', () => {
  it('defaults to 12m', () => {
    expect(parseAnalyticsPeriodSearchParams(new URLSearchParams())).toEqual({
      preset: '12m',
      start: null,
      end: null,
    });
  });

  it('parses custom range', () => {
    const params = new URLSearchParams('preset=custom&start=2026-03-03&end=2026-03-18');
    expect(parseAnalyticsPeriodSearchParams(params)).toEqual({
      preset: 'custom',
      start: '2026-03-03',
      end: '2026-03-18',
    });
  });
});

describe('formatCustomRangeLabel', () => {
  it('formats es-MX short range', () => {
    expect(formatCustomRangeLabel('2026-03-03', '2026-03-18')).toMatch(/3 mar.*18 mar/i);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd frontend && npx vitest run src/lib/analytics/period.test.ts`  
Expected: FAIL (module missing). If vitest not configured, run with `npx tsx --test src/lib/analytics/period.test.ts` following repo pattern.

- [ ] **Step 3: Implement utilities**

```typescript
export const DEFAULT_ANALYTICS_PERIOD = { preset: '12m', start: null, end: null } as const;

export const ANALYTICS_PRESET_OPTIONS = [
  { preset: '7d', label: 'Últimos 7 días' },
  { preset: '4w', label: 'Últimas 4 semanas' },
  { preset: '12m', label: 'Últimos 12 meses' },
  { preset: 'custom', label: 'Personalizado' },
] as const;
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/analytics/period.ts frontend/src/lib/analytics/period.test.ts
git commit -m "feat(analytics): add period URL helpers and labels"
```

---

### Task 5: Update analytics hook for preset query

**Files:**
- Modify: `frontend/src/hooks/useRestaurantAnalytics.ts`

**Interfaces:**
- Consumes: `getRestaurantAnalytics(token, id, AnalyticsPeriodQuery)`
- Produces: `useRestaurantAnalytics(query: AnalyticsPeriodQuery)` returning `{ data, loading, refreshing, error, reload }`

- [ ] **Step 1: Replace granularity arg with query object**

Key changes:
- Dependency array uses `query.preset`, `query.start`, `query.end`
- Call `getRestaurantAnalytics(accessToken, selectedRestaurantId, query)`
- Keep `hasLoadedRef` / `refreshing` behavior from prior fix

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useRestaurantAnalytics.ts
git commit -m "feat(analytics): fetch dashboard by preset and custom range"
```

---

### Task 6: AnalyticsPeriodControl + DateRangePopover (ui-ux-pro-max)

**Files:**
- Create: `frontend/src/components/analytics/AnalyticsPeriodControl.tsx`
- Create: `frontend/src/components/analytics/AnalyticsDateRangePopover.tsx`
- Create: `frontend/src/components/analytics/AnalyticsPeriodControl.module.css`

**Interfaces:**
- Consumes: `AnalyticsPeriodQuery`, `refreshing: boolean`
- Produces props callback: `onPeriodChange(query: AnalyticsPeriodQuery)`

- [ ] **Step 1: Build segmented control**

```tsx
type AnalyticsPeriodControlProps = {
  value: AnalyticsPeriodQuery;
  refreshing: boolean;
  onChange: (next: AnalyticsPeriodQuery) => void;
};
```

Behavior:
- Render `role="tablist"` with 4 buttons from `ANALYTICS_PRESET_OPTIONS`
- Click preset `7d|4w|12m` → `onChange({ preset, start: null, end: null })` immediately
- Click `custom` → open popover; **do not** fetch until Aplicar
- Custom tab label: `formatCustomRangeLabel` when active custom range exists
- `disabled={refreshing}` on buttons during fetch
- `cursor: pointer`, focus ring, active state uses `--color-primary`

- [ ] **Step 2: Build popover with react-day-picker**

```tsx
import { DayPicker } from 'react-day-picker';
import { es } from 'date-fns/locale';
import 'react-day-picker/style.css';
```

- Mode `range`, locale `es`
- Draft state local until **Aplicar**
- **Cancelar** closes without change
- **Aplicar** calls `onChange({ preset: 'custom', start, end })` with `YYYY-MM-DD`
- Overlay/popover positioned below control; mobile full-width
- Override day-picker CSS in module to match panel tokens (border, primary, radius)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/analytics/AnalyticsPeriodControl.tsx frontend/src/components/analytics/AnalyticsDateRangePopover.tsx frontend/src/components/analytics/AnalyticsPeriodControl.module.css
git commit -m "feat(analytics): add global period control and date range popover"
```

---

### Task 7: Wire AnalyticsPage + URL sync

**Files:**
- Modify: `frontend/src/components/pages/AnalyticsPage.tsx`
- Modify: `frontend/src/components/pages/AnalyticsPage.module.css`

**Interfaces:**
- Consumes: `AnalyticsPeriodControl`, `useRestaurantAnalytics`, URL helpers

- [ ] **Step 1: Add URL sync with Next.js searchParams**

In `AnalyticsPage`:
- `useSearchParams`, `useRouter`, `usePathname`
- Initialize state from `parseAnalyticsPeriodSearchParams`
- On period change: update state + `router.replace` with `buildAnalyticsPeriodSearchParams`
- Pass query to `useRestaurantAnalytics(query)`

- [ ] **Step 2: Move control to header; remove chart tabs**

Header layout (desktop):
```
[Title + subtitle with period.label]     [AnalyticsPeriodControl] [Actualizar]
```

Remove:
- `granularity` local state
- Chart section tab buttons
- Keep chart title only: "Ventas por periodo"

Keep soft refresh wrappers (`contentRefreshing`) from prior fix.

- [ ] **Step 3: Responsive CSS**

In `AnalyticsPage.module.css`:
- `.headerTop` flex wrap
- `.periodControlWrap` full width on `@media (max-width: 768px)`
- Popover min-width usable on mobile

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/pages/AnalyticsPage.tsx frontend/src/components/pages/AnalyticsPage.module.css
git commit -m "feat(analytics): integrate global period selector in dashboard header"
```

---

### Task 8: Verification

**Files:** (none — run commands)

- [ ] **Step 1: Backend tests**

Run: `cd backend && pytest tests/modules/test_analytics_period.py tests/modules/test_analytics_repo.py -v`  
Expected: all PASS

- [ ] **Step 2: Frontend tests**

Run: `cd frontend && npx vitest run src/lib/analytics/period.test.ts`  
Expected: PASS

- [ ] **Step 3: Frontend lint**

Run: `cd frontend && npm run lint -- src/components/analytics src/components/pages/AnalyticsPage.tsx src/hooks/useRestaurantAnalytics.ts src/lib/analytics src/lib/api/analytics.ts`  
Expected: exit 0 (or only pre-existing warnings unrelated to changes)

- [ ] **Step 4: Manual QA checklist**

1. `/analytics` loads with **Últimos 12 meses** default
2. Switch to **Últimos 7 días** → KPIs + chart update, no blank page
3. **Personalizado** → pick range → **Aplicar** → dashboard updates, subtitle shows formatted range
4. `% vs periodo anterior` present for presets and custom
5. Refresh browser with `?preset=7d` preserves selection
6. Invalid custom range (future end) shows API error banner, keeps previous data if any

---

## Spec Coverage Self-Review

| Spec requirement | Task |
|------------------|------|
| Selector global en header | Task 6–7 |
| Labels reales | Task 4, 6 |
| Personalizado con calendario | Task 6 |
| Sin tabs en chart | Task 7 |
| Comparación igual duración (custom) | Task 1 |
| Buckets auto custom | Task 1 |
| Soft refresh | Task 5, 7 (preserve prior hook behavior) |
| Validación 400 español | Task 1 |
| Compat granularity | Task 1–2 |
| `period.preset` in response | Task 1 |
| URL sync | Task 4, 7 |
| ui-ux-pro-max a11y/styling | Task 6–7 |

No placeholders remain. Types consistent: `AnalyticsPreset`, `AnalyticsPeriodQuery` used end-to-end.

# Analytics — Selector de periodo global

**Fecha:** 2026-07-20  
**Estado:** Diseño aprobado en chat — pendiente review del archivo antes del plan  
**Ámbito:** Dashboard restaurante `/analytics` (frontend panel + backend analytics)

## Problema

Los controles Diario / Semanal / Mensual viven dentro del gráfico “Ventas por periodo”, pero en realidad cambian **todo** el dashboard (KPIs, clientes, productos, donuts). Eso confunde: el usuario espera que solo cambie el gráfico, y ve moverse ticket promedio, ventas totales, etc.

Además, no existe un rango de fechas personalizado.

## Objetivo

Un **selector de periodo global** en el header de Analíticas que deja explícito que todo el dashboard se recalcula con el periodo elegido, incluyendo **Personalizado** (rango de fechas).

## Decisiones de producto

| Tema | Decisión |
|------|----------|
| Labels de presets | Periodo real: **Últimos 7 días / Últimas 4 semanas / Últimos 12 meses** |
| Personalizado | Sí — calendario de rango inicio/fin |
| Comparación “vs periodo anterior” | Periodo anterior de **igual duración** (también en custom) |
| Buckets del gráfico en custom | Automático: ≤31 días → daily; ≤90 días → weekly; más → monthly |
| UI pattern | Segmented control global + popover de rango (enfoque 1) |
| Tabs en el gráfico | Se eliminan; el control vive solo en el header |

## UI (ui-ux-pro-max)

**Estilo guía:** Data-Dense Dashboard (filtros visibles, feedback de carga, densidad útil sin ornamentación).

### Layout header

```
Analíticas                    [Últimos 7 días | Últimas 4 semanas | Últimos 12 meses | Personalizado]
Métricas … · {period.label}                                                     [Actualizar]
```

- Segmented control a la derecha del bloque de título (desktop).
- En mobile: control debajo del título, wrap permitido; popover a ancho usable.
- Al elegir **Personalizado**, abrir popover con date-range picker:
  - Calendario de un mes con navegación prev/next.
  - Selección inicio → fin.
  - Locale `es-MX` (fechas legibles: `3 mar – 18 mar`).
  - Botón **Aplicar** (no refetch hasta aplicar).
  - Si ya hay rango activo, el chip/tab Personalizado muestra el rango abreviado.
- Quitar por completo los tabs del chart section.
- Mantener soft-refresh: no pantalla completa de “Cargando…” si ya hay datos; atenuar contenido (`opacity`) + “Actualizando…”.
- A11y: `role="tablist"` / `aria-selected`, focus visible, `cursor-pointer`, sin emojis como iconos, contraste AA, respetar `prefers-reduced-motion`.
- Colores: reutilizar tokens del panel (`--color-primary`, borders, surfaces). No introducir tipografía nueva ni tema purple/glow.

### Copy

| Preset | Label UI | `period.label` API |
|--------|----------|--------------------|
| 7d | Últimos 7 días | Últimos 7 días |
| 4w | Últimas 4 semanas | Últimas 4 semanas |
| 12m | Últimos 12 meses | Últimos 12 meses |
| custom | Personalizado (o fechas si hay rango) | Rango formateado, ej. `3 mar 2026 – 18 mar 2026` |

## API

### Endpoint

`GET /restaurants/{restaurant_id}/analytics`

### Query params

| Param | Tipo | Default | Notas |
|-------|------|---------|-------|
| `preset` | `7d` \| `4w` \| `12m` \| `custom` | `12m` | Nuevo control principal |
| `start` | `YYYY-MM-DD` | — | Requerido si `preset=custom` |
| `end` | `YYYY-MM-DD` | — | Requerido si `preset=custom` |
| `granularity` | `daily` \| `weekly` \| `monthly` | — | **Deprecated compat:** mapear a `7d` / `4w` / `12m` si `preset` no viene |

### Reglas de periodo (timezone del restaurante)

| Preset | Ventana actual | Comparación | Buckets gráfico |
|--------|----------------|-------------|-----------------|
| `7d` | Últimos 7 días (hoy inclusive) | 7 días previos | daily |
| `4w` | Últimas 4 semanas | 4 semanas previas | weekly |
| `12m` | Últimos 12 meses (desde día 1 del mes −11) | 12 meses previos | monthly |
| `custom` | `start` 00:00:00 → `end` 23:59:59.999999 local | Periodo inmediatamente anterior de la misma duración en días | auto por duración |

### Validación custom

- `start` y `end` requeridos.
- `start ≤ end`.
- `end` no puede ser futuro (respecto a “hoy” en timezone del restaurante).
- Duración máxima: **366 días** (inclusive).
- Errores: `400` con mensaje claro en español.

### Respuesta

Sin cambio estructural de `AnalyticsDashboard`.  
`period.granularity` sigue reportando el bucket usado en `sales_series` (`daily` \| `weekly` \| `monthly`).  
`period.label` refleja el texto del periodo activo.

Opcional (recomendado): añadir `period.preset` (`7d` \| `4w` \| `12m` \| `custom`) para que el frontend no tenga que inferirlo.

## Frontend

### Estado

```ts
type AnalyticsPreset = '7d' | '4w' | '12m' | 'custom';

type AnalyticsPeriodState = {
  preset: AnalyticsPreset;
  start: string | null; // YYYY-MM-DD, solo custom
  end: string | null;
};
```

Default: `{ preset: '12m', start: null, end: null }` (equivalente al monthly actual).

### Hook

`useRestaurantAnalytics({ preset, start?, end? })`  
- Sigue diferenciando `loading` (primera carga / cambio de restaurante) vs `refreshing` (cambio de periodo o Actualizar).
- No vaciar `data` en refresh de periodo.

### Componentes

- `AnalyticsPeriodControl` — segmented control + orquestación del popover.
- `AnalyticsDateRangePopover` — picker de rango + Aplicar / Cancelar.
- Dependencia: `react-day-picker` (+ `date-fns` si hace falta para locale). Mantener estilos alineados al CSS module del panel (no forzar un look ajeno).

### URL sync (v1 recomendado)

Query params espejo: `?preset=7d` o `?preset=custom&start=2026-03-03&end=2026-03-18`  
para deep-link / refresh del browser. Si se recorta scope, omitible en v1.

## Comportamiento de carga

1. Primera visita → loading completo.
2. Cambio de preset/rango → soft refresh (datos previos visibles atenuados).
3. Error en refresh → mantener datos previos + banner de error reintentable.
4. Cambio de restaurante → reset a loading / default preset.

## Fuera de alcance (v1)

- Comparación vs mismo rango del año pasado.
- Export CSV / PDF.
- Multi-mes simultáneo en el picker.
- Guardar “último periodo usado” en preferencias de usuario.
- Cambios en delivery-dashboard (stub).

## Criterios de aceptación

1. El selector global está en el header; no hay tabs de granularidad en el chart.
2. Cambiar entre Últimos 7 días / 4 semanas / 12 meses actualiza KPIs, series, side panels y label del periodo.
3. Personalizado permite elegir rango, Aplicar dispara fetch, y el dashboard usa ese rango.
4. En custom, “vs periodo anterior” usa ventana previa de igual duración.
5. Buckets del gráfico en custom siguen la regla ≤31 / ≤90 / else.
6. Soft refresh: no flash de página vacía al cambiar periodo.
7. Validaciones custom devuelven 400 con mensaje usable.
8. Compat: clientes que aún manden `granularity=daily|weekly|monthly` siguen funcionando.

## Archivos principales a tocar

**Backend:** `api.py`, `service.py` (`_period_bounds` / preset), `schemas.py`, tests de analytics.  
**Frontend:** `AnalyticsPage.tsx` + CSS, nuevo control/popover, `useRestaurantAnalytics.ts`, `lib/api/analytics.ts`.

## Riesgos

- Añadir date picker aumenta superficie UI/a11y — limitar a un componente encapsulado.
- Fechas timezone: siempre interpretar `start`/`end` en timezone del restaurante, no UTC crudo del browser sin conversión.
- Rango muy largo (365d) con bucket monthly sigue siendo razonable; daily en 31d también.

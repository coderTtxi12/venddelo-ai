import { dispatchSourceLabel } from './monitorCopy';

export const STATS_SOURCE_COLORS = {
  web_app: '#2563eb',
  manual: '#d97706',
} as const;

export type StatsChangeTone = 'up' | 'down' | 'flat';

export function statsChangeTone(pct: number | null | undefined): StatsChangeTone {
  if (pct == null || pct === 0) return 'flat';
  return pct > 0 ? 'up' : 'down';
}

export function statsTrendPoints(
  series: Array<{ label: string; current_count: number; previous_count: number }>,
) {
  return series.map((point) => ({
    label: point.label,
    current: point.current_count,
    previous: point.previous_count,
  }));
}

export function statsSourceSegments(
  sources: Array<{ source: 'web_app' | 'manual'; count: number }>,
) {
  return sources.map((row) => ({
    key: row.source,
    label: dispatchSourceLabel(row.source),
    value: row.count,
    color: STATS_SOURCE_COLORS[row.source],
  }));
}

export function statsRankPoints(
  rows: Array<{ id: string; name: string; delivered_count: number; earnings_cents: number }>,
) {
  return rows.map((row) => ({
    key: row.id,
    label: row.name,
    value: row.delivered_count,
    earningsCents: row.earnings_cents,
  }));
}

export function formatIsoDayRange(start: string, end: string): string {
  if (start === end) return start;
  return `${start} a ${end}`;
}

export function statsGranularityLabel(granularity: 'hourly' | 'daily' | 'weekly'): string {
  if (granularity === 'hourly') return 'Por hora';
  if (granularity === 'daily') return 'Por día';
  return 'Por semana';
}

export function hourBucketRange(hour: number): string {
  const start = String(hour).padStart(2, '0');
  return `${start}:00–${start}:59`;
}

export const DURATION_METRICS = [
  {
    key: 'total',
    secondsKey: 'avg_total_seconds',
    changeKey: 'avg_total_seconds_change_pct',
    label: 'Solicitar → entregar',
    hint: 'Incluye espera de cocina',
    color: '#0f766e',
  },
  {
    key: 'search',
    secondsKey: 'avg_search_seconds',
    changeKey: 'avg_search_seconds_change_pct',
    label: 'Buscando',
    hint: 'Hasta asignar',
    color: '#d97706',
  },
  {
    key: 'delivery',
    secondsKey: 'avg_delivery_seconds',
    changeKey: 'avg_delivery_seconds_change_pct',
    label: 'Buscar → entregar',
    hint: 'Sin la espera previa a buscar',
    color: '#2563eb',
  },
  {
    key: 'pickup',
    secondsKey: 'avg_pickup_seconds',
    changeKey: 'avg_pickup_seconds_change_pct',
    label: 'Recolección',
    hint: 'Viaje al negocio',
    color: '#7c3aed',
  },
  {
    key: 'dropoff',
    secondsKey: 'avg_dropoff_seconds',
    changeKey: 'avg_dropoff_seconds_change_pct',
    label: 'Entrega',
    hint: 'Viaje al cliente',
    color: '#db2777',
  },
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

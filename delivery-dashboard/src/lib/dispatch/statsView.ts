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

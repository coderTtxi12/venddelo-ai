import type { DispatchStatsRestaurant } from '../api/types';

export type BusinessHoldFilter = 'all' | 'active' | 'hold';

export const BUSINESS_LINE_COLORS = [
  '#2563eb',
  '#0f766e',
  '#c2410c',
  '#7c3aed',
  '#be123c',
  '#0369a1',
  '#4d7c0f',
  '#b45309',
  '#4338ca',
  '#0e7490',
] as const;

export type BusinessOrderRow = {
  id: string;
  name: string;
  onHold: boolean;
  orderCount: number;
  counts: number[];
  color: string;
};

export function toBusinessOrderRows(
  restaurants: DispatchStatsRestaurant[],
  bucketCount: number,
): BusinessOrderRow[] {
  const length = Math.max(0, bucketCount);
  return restaurants.map((row, index) => {
    const counts = Array.from({ length }, (_, bucket) => row.counts?.[bucket] ?? 0);
    return {
      id: row.id,
      name: row.name,
      onHold: row.on_hold,
      orderCount: counts.reduce((sum, value) => sum + value, 0),
      counts,
      color: BUSINESS_LINE_COLORS[index % BUSINESS_LINE_COLORS.length],
    };
  });
}

export function sortBusinessOrders(rows: BusinessOrderRow[]): BusinessOrderRow[] {
  return [...rows].sort(
    (a, b) => b.orderCount - a.orderCount || a.name.localeCompare(b.name, 'es'),
  );
}

export function filterBusinessOrders(
  rows: BusinessOrderRow[],
  hold: BusinessHoldFilter,
  query: string,
): BusinessOrderRow[] {
  const needle = query.trim().toLocaleLowerCase('es');
  return rows.filter((row) => {
    if (hold === 'active' && row.onHold) return false;
    if (hold === 'hold' && !row.onHold) return false;
    if (needle && !row.name.toLocaleLowerCase('es').includes(needle)) return false;
    return true;
  });
}

export type BusinessLinePoint = {
  label: string;
} & Record<string, number | string>;

export function businessLinePoints(
  labels: string[],
  rows: BusinessOrderRow[],
): BusinessLinePoint[] {
  return labels.map((label, index) => {
    const point: BusinessLinePoint = { label };
    for (const row of rows) point[row.id] = row.counts[index] ?? 0;
    return point;
  });
}

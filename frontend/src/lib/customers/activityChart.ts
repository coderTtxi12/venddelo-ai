import type { RestaurantCustomerActivityItem } from '@/lib/api/customers';

export type ActivityChartMode = '7d' | 'week' | 'month' | 'custom';

export type ActivityTimelinePoint = {
  created_at: string;
};

export type ActivityChartBucket = {
  key: string;
  label: string;
  shortLabel: string;
  count: number;
  start: Date;
  end: Date;
};

export type ActivityHistorySort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_COUNT = 8;
const MONTH_COUNT = 6;

const DAY_LABEL = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const WEEK_LABEL = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const MONTH_LABEL = new Intl.DateTimeFormat('es-MX', { month: 'short' });

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const weekday = (day.getDay() + 6) % 7;
  return new Date(day.getTime() - weekday * DAY_MS);
}

function endOfDay(date: Date): Date {
  const start = startOfDay(date);
  return new Date(start.getTime() + DAY_MS - 1);
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  return new Date(start.getTime() + 7 * DAY_MS - 1);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function capitalizeLabel(label: string): string {
  return label.charAt(0).toLocaleUpperCase('es-MX') + label.slice(1);
}

function formatDayLabel(date: Date): string {
  return capitalizeLabel(DAY_LABEL.format(date));
}

function formatDayShortLabel(date: Date): string {
  return String(date.getDate());
}

function formatWeekLabel(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()}–${WEEK_LABEL.format(end)}`;
  }
  return `${formatDayLabel(start)}–${formatDayLabel(end)}`;
}

function formatWeekShortLabel(start: Date): string {
  return formatDayLabel(start);
}

function formatMonthLabel(date: Date): string {
  return capitalizeLabel(MONTH_LABEL.format(date));
}

function parseDateInput(value: string): Date {
  return startOfDay(new Date(`${value}T12:00:00`));
}

function itemInRange(point: ActivityTimelinePoint, start: Date, end: Date): boolean {
  const created = new Date(point.created_at);
  if (Number.isNaN(created.getTime())) return false;
  return created >= start && created <= end;
}

function countPointsInRange(
  points: ActivityTimelinePoint[],
  start: Date,
  end: Date,
): number {
  return points.filter((point) => itemInRange(point, start, end)).length;
}

export function timelineFromItems(
  items: RestaurantCustomerActivityItem[],
): ActivityTimelinePoint[] {
  return items.map((item) => ({ created_at: item.created_at }));
}

export function buildLast7DaysBuckets(
  points: ActivityTimelinePoint[],
  now = new Date(),
): ActivityChartBucket[] {
  const anchor = startOfDay(now);
  const buckets: ActivityChartBucket[] = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const start = new Date(anchor.getTime() - offset * DAY_MS);
    const end = endOfDay(start);
    buckets.push({
      key: start.toISOString().slice(0, 10),
      label: formatDayLabel(start),
      shortLabel: formatDayShortLabel(start),
      count: countPointsInRange(points, start, end),
      start,
      end,
    });
  }

  return buckets;
}

export function buildWeeklyActivityBuckets(
  points: ActivityTimelinePoint[],
  now = new Date(),
): ActivityChartBucket[] {
  const anchor = startOfWeek(now);
  const buckets: ActivityChartBucket[] = [];

  for (let offset = WEEK_COUNT - 1; offset >= 0; offset -= 1) {
    const start = new Date(anchor.getTime() - offset * 7 * DAY_MS);
    const end = endOfWeek(start);
    buckets.push({
      key: start.toISOString().slice(0, 10),
      label: formatWeekLabel(start, end),
      shortLabel: formatWeekShortLabel(start),
      count: countPointsInRange(points, start, end),
      start,
      end,
    });
  }

  return buckets;
}

export function buildMonthlyActivityBuckets(
  points: ActivityTimelinePoint[],
  now = new Date(),
): ActivityChartBucket[] {
  const anchor = startOfMonth(now);
  const buckets: ActivityChartBucket[] = [];

  for (let offset = MONTH_COUNT - 1; offset >= 0; offset -= 1) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
    const end = endOfMonth(start);
    buckets.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      label: formatMonthLabel(start),
      shortLabel: formatMonthLabel(start).slice(0, 3),
      count: countPointsInRange(points, start, end),
      start,
      end,
    });
  }

  return buckets;
}

export function buildCustomActivityBuckets(
  points: ActivityTimelinePoint[],
  rangeStart: string,
  rangeEnd: string,
): ActivityChartBucket[] {
  const start = parseDateInput(rangeStart);
  const end = endOfDay(parseDateInput(rangeEnd));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const spanDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const useDaily = spanDays <= 14;
  const buckets: ActivityChartBucket[] = [];

  if (useDaily) {
    for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
      const dayEnd = endOfDay(cursor);
      buckets.push({
        key: cursor.toISOString().slice(0, 10),
        label: formatDayLabel(cursor),
        shortLabel: formatDayShortLabel(cursor),
        count: countPointsInRange(points, cursor, dayEnd),
        start: cursor,
        end: dayEnd,
      });
    }
    return buckets;
  }

  let cursor = startOfWeek(start);
  while (cursor <= end) {
    const weekStart = cursor < start ? start : cursor;
    const weekEnd = endOfWeek(cursor);
    const boundedEnd = weekEnd > end ? end : weekEnd;
    buckets.push({
      key: cursor.toISOString().slice(0, 10),
      label: formatWeekLabel(weekStart, boundedEnd),
      shortLabel: formatWeekShortLabel(weekStart),
      count: countPointsInRange(points, weekStart, boundedEnd),
      start: weekStart,
      end: boundedEnd,
    });
    cursor = new Date(cursor.getTime() + 7 * DAY_MS);
  }

  return buckets;
}

export function buildActivityChartBuckets(
  mode: ActivityChartMode,
  points: ActivityTimelinePoint[],
  customRange?: { start: string; end: string },
): ActivityChartBucket[] {
  if (mode === '7d') return buildLast7DaysBuckets(points);
  if (mode === 'week') return buildWeeklyActivityBuckets(points);
  if (mode === 'month') return buildMonthlyActivityBuckets(points);
  if (!customRange) return [];
  return buildCustomActivityBuckets(points, customRange.start, customRange.end);
}

export function defaultCustomRange(now = new Date()): { start: string; end: string } {
  const end = startOfDay(now);
  const start = new Date(end.getTime() - 29 * DAY_MS);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function sortActivityHistory(
  items: RestaurantCustomerActivityItem[],
  sort: ActivityHistorySort,
): RestaurantCustomerActivityItem[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (sort === 'date-desc' || sort === 'date-asc') {
      const cmp = a.created_at.localeCompare(b.created_at);
      return sort === 'date-desc' ? -cmp : cmp;
    }
    const cmp = a.total_cents - b.total_cents || a.created_at.localeCompare(b.created_at);
    return sort === 'amount-desc' ? -cmp : cmp;
  });
  return copy;
}

export function computeAverageOrderMetrics(items: RestaurantCustomerActivityItem[]): {
  avgTicketCents: number | null;
  avgItemQuantity: number | null;
} {
  const delivered = items.filter((item) => item.status === 'delivered');
  const avgTicketCents =
    delivered.length > 0
      ? Math.round(delivered.reduce((sum, item) => sum + item.total_cents, 0) / delivered.length)
      : null;

  const withItems = items.filter((item) => (item.item_quantity ?? 0) > 0);
  const avgItemQuantity =
    withItems.length > 0
      ? Math.round(
          (withItems.reduce((sum, item) => sum + (item.item_quantity ?? 0), 0) / withItems.length) *
            10,
        ) / 10
      : null;

  return { avgTicketCents, avgItemQuantity };
}

export function googleMapsCoordinateUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export function googleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function resolveDeliveryMapsUrl(
  address: string,
  mapsUrl?: string | null,
): string {
  const trimmed = mapsUrl?.trim();
  if (trimmed) return trimmed;
  return googleMapsSearchUrl(address);
}

/** Prefer exact pin (lat/lng); fall back to address search. */
export function resolveOrderDeliveryMapsUrl(order: {
  delivery_address?: string | null;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
}): string | null {
  const lat = order.delivery_latitude;
  const lng = order.delivery_longitude;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return googleMapsCoordinateUrl(lat, lng);
  }
  const address = order.delivery_address?.trim();
  if (address) return googleMapsSearchUrl(address);
  return null;
}

/** Exact pin only — used when copying so clipboard always gets lat,lng when available. */
export function resolveOrderDeliveryPinUrl(order: {
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
}): string | null {
  const lat = order.delivery_latitude;
  const lng = order.delivery_longitude;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return googleMapsCoordinateUrl(lat, lng);
  }
  return null;
}

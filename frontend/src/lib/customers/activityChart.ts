import type { RestaurantCustomerActivityItem } from '@/lib/api/customers';

export type ActivityChartMode = 'week' | 'custom';

export type ActivityChartBucket = {
  key: string;
  label: string;
  count: number;
  start: Date;
  end: Date;
};

export type ActivityHistorySort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_COUNT = 8;

const DAY_LABEL = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const WEEK_LABEL = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

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

function formatDayLabel(date: Date): string {
  const label = DAY_LABEL.format(date);
  return label.charAt(0).toLocaleUpperCase('es-MX') + label.slice(1);
}

function formatWeekLabel(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()}–${WEEK_LABEL.format(end)}`;
  }
  return `${formatDayLabel(start)}–${formatDayLabel(end)}`;
}

function itemInRange(item: RestaurantCustomerActivityItem, start: Date, end: Date): boolean {
  const created = new Date(item.created_at);
  if (Number.isNaN(created.getTime())) return false;
  return created >= start && created <= end;
}

function countItemsInRange(
  items: RestaurantCustomerActivityItem[],
  start: Date,
  end: Date,
): number {
  return items.filter((item) => itemInRange(item, start, end)).length;
}

export function buildWeeklyActivityBuckets(
  items: RestaurantCustomerActivityItem[],
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
      count: countItemsInRange(items, start, end),
      start,
      end,
    });
  }

  return buckets;
}

export function buildCustomActivityBuckets(
  items: RestaurantCustomerActivityItem[],
  rangeStart: string,
  rangeEnd: string,
): ActivityChartBucket[] {
  const start = startOfDay(new Date(rangeStart));
  const end = endOfDay(new Date(rangeEnd));
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
        count: countItemsInRange(items, cursor, dayEnd),
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
      count: countItemsInRange(items, weekStart, boundedEnd),
      start: weekStart,
      end: boundedEnd,
    });
    cursor = new Date(cursor.getTime() + 7 * DAY_MS);
  }

  return buckets;
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

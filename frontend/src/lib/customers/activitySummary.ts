import type {
  CustomerSource,
  RestaurantCustomer,
  RestaurantCustomerActivity,
  RestaurantCustomerActivityItem,
} from '@/lib/api/customers';

export type CustomerActivityStatusBucket = 'delivered' | 'cancelled' | 'in_progress' | 'other';

export type CustomerActivityMonthBucket = {
  key: string;
  label: string;
  count: number;
};

export type CustomerActivitySummary = {
  menuCount: number;
  deliveryCount: number;
  statusCounts: Record<CustomerActivityStatusBucket, number>;
  monthlyActivity: CustomerActivityMonthBucket[];
  deliveredSpentCents: number;
};

const IN_PROGRESS_STATUSES = new Set([
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'scheduled',
  'searching',
  'offered',
  'assigned',
  'picked_up',
  'in_transit',
  'unassigned',
]);

const MONTH_FORMAT = new Intl.DateTimeFormat('es-MX', { month: 'short' });
const MONTH_COUNT = 6;

export function classifyActivityStatus(status: string): CustomerActivityStatusBucket {
  if (status === 'delivered') return 'delivered';
  if (status === 'cancelled') return 'cancelled';
  if (IN_PROGRESS_STATUSES.has(status)) return 'in_progress';
  return 'other';
}

export function activityStatusBucketLabel(bucket: CustomerActivityStatusBucket): string {
  if (bucket === 'delivered') return 'Entregados';
  if (bucket === 'cancelled') return 'Cancelados';
  if (bucket === 'in_progress') return 'En curso';
  return 'Otros';
}

function monthKeyFromIso(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function monthLabelFromKey(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  const label = MONTH_FORMAT.format(new Date(year, month - 1, 1));
  return label.charAt(0).toLocaleUpperCase('es-MX') + label.slice(1);
}

function buildMonthlyBucketsFromTimestamps(timestamps: string[]): CustomerActivityMonthBucket[] {
  const counts = new Map<string, number>();
  for (const value of timestamps) {
    const key = monthKeyFromIso(value);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const sortedKeys = [...counts.keys()].sort();
  const anchorKey = sortedKeys.at(-1) ?? monthKeyFromIso(new Date().toISOString())!;
  const [anchorYear, anchorMonth] = anchorKey.split('-').map(Number);

  const buckets: CustomerActivityMonthBucket[] = [];
  for (let offset = MONTH_COUNT - 1; offset >= 0; offset -= 1) {
    const date = new Date(anchorYear, anchorMonth - 1 - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({
      key,
      label: monthLabelFromKey(key),
      count: counts.get(key) ?? 0,
    });
  }
  return buckets;
}

function buildMonthlyBuckets(items: RestaurantCustomerActivityItem[]): CustomerActivityMonthBucket[] {
  return buildMonthlyBucketsFromTimestamps(items.map((item) => item.created_at));
}

export function summarizeCustomerActivity(
  customer: RestaurantCustomer,
  items: RestaurantCustomerActivityItem[],
): CustomerActivitySummary {
  const statusCounts: CustomerActivitySummary['statusCounts'] = {
    delivered: 0,
    cancelled: 0,
    in_progress: 0,
    other: 0,
  };

  let menuCount = 0;
  let deliveryCount = 0;
  let deliveredSpentCents = 0;

  for (const item of items) {
    if (item.kind === 'menu') menuCount += 1;
    if (item.kind === 'delivery') deliveryCount += 1;
    statusCounts[classifyActivityStatus(item.status)] += 1;
    if (item.status === 'delivered') deliveredSpentCents += item.total_cents;
  }

  return {
    menuCount: items.length > 0 ? menuCount : customer.order_count,
    deliveryCount: items.length > 0 ? deliveryCount : customer.delivery_count,
    statusCounts,
    monthlyActivity: buildMonthlyBuckets(items),
    deliveredSpentCents:
      items.length > 0 ? deliveredSpentCents : customer.total_spent_cents,
  };
}

export function summaryFromActivity(
  customer: RestaurantCustomer,
  activity: RestaurantCustomerActivity,
): CustomerActivitySummary {
  const { summary } = activity;
  if (!summary) {
    return summarizeCustomerActivity(customer, activity.items);
  }
  const statusCounts: CustomerActivitySummary['statusCounts'] = {
    delivered: summary.status_delivered,
    cancelled: summary.status_cancelled,
    in_progress: summary.status_in_progress,
    other: summary.status_other,
  };
  const totalEvents =
    summary.menu_count + summary.delivery_count > 0
      ? summary.menu_count + summary.delivery_count
      : 0;

  return {
    menuCount: totalEvents > 0 ? summary.menu_count : customer.order_count,
    deliveryCount: totalEvents > 0 ? summary.delivery_count : customer.delivery_count,
    statusCounts,
    monthlyActivity: buildMonthlyBucketsFromTimestamps(summary.timeline),
    deliveredSpentCents: customer.total_spent_cents,
  };
}

export function activityItemCountsTowardSpend(status: string): boolean {
  return status === 'delivered';
}

export function channelLabel(source: CustomerSource): string {
  return source === 'menu' ? 'Menú digital' : 'Delivery manual';
}

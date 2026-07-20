import {
  getRestaurantOrderSummary,
  listRestaurantOrders,
} from '@/lib/api/orders';
import type { Order, OrderStatusSummary } from '@/lib/api/types';
import { sortOrdersNewestFirst } from '@/lib/orders/orderDisplay';
import {
  DEFAULT_KITCHEN_STATUS_FILTER,
  orderFilterToApiParams,
  type OrderStatusFilter,
} from '@/lib/orders/orderStatus';

export const KITCHEN_ORDERS_INITIAL_PAGE_SIZE = 50;
export const KITCHEN_ORDERS_CACHE_TTL_MS = 60_000;

export type KitchenOrdersCacheEntry = {
  orders: Order[];
  nextCursor: string | null;
  hasMore: boolean;
  summary: OrderStatusSummary;
  fetchedAt: number;
};

const cache = new Map<string, KitchenOrdersCacheEntry>();
const inflight = new Map<string, Promise<void>>();

function cacheKey(restaurantId: string, filter: OrderStatusFilter): string {
  return `${restaurantId}:${filter}`;
}

export function getKitchenOrdersCache(
  restaurantId: string,
  filter: OrderStatusFilter,
  now = Date.now(),
): KitchenOrdersCacheEntry | null {
  const entry = cache.get(cacheKey(restaurantId, filter));
  if (!entry) return null;
  if (now - entry.fetchedAt > KITCHEN_ORDERS_CACHE_TTL_MS) {
    cache.delete(cacheKey(restaurantId, filter));
    return null;
  }
  return entry;
}

export function setKitchenOrdersCache(
  restaurantId: string,
  filter: OrderStatusFilter,
  entry: Omit<KitchenOrdersCacheEntry, 'fetchedAt'>,
  fetchedAt = Date.now(),
): void {
  cache.set(cacheKey(restaurantId, filter), {
    ...entry,
    fetchedAt,
  });
}

export function invalidateKitchenOrdersCache(restaurantId?: string): void {
  if (!restaurantId) {
    cache.clear();
    inflight.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(`${restaurantId}:`)) {
      cache.delete(key);
    }
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(`${restaurantId}:`)) {
      inflight.delete(key);
    }
  }
}

export async function fetchKitchenOrdersPage(
  token: string,
  restaurantId: string,
  filter: OrderStatusFilter,
): Promise<KitchenOrdersCacheEntry> {
  const query = orderFilterToApiParams(filter);
  const [page, summary] = await Promise.all([
    listRestaurantOrders(token, restaurantId, KITCHEN_ORDERS_INITIAL_PAGE_SIZE, null, query),
    getRestaurantOrderSummary(token, restaurantId),
  ]);

  return {
    orders: sortOrdersNewestFirst(page.items),
    nextCursor: page.next_cursor,
    hasMore: page.has_more,
    summary,
    fetchedAt: Date.now(),
  };
}

export async function prefetchKitchenOrders(
  token: string,
  restaurantId: string,
  filter: OrderStatusFilter = DEFAULT_KITCHEN_STATUS_FILTER,
): Promise<void> {
  const key = cacheKey(restaurantId, filter);
  if (getKitchenOrdersCache(restaurantId, filter)) return;

  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchKitchenOrdersPage(token, restaurantId, filter)
      .then((entry) => {
        setKitchenOrdersCache(restaurantId, filter, entry, entry.fetchedAt);
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, pending);
  }

  await pending;
}

/** @internal test helper */
export function clearKitchenOrdersCacheForTests(): void {
  cache.clear();
  inflight.clear();
}

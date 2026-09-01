import { apiRequest } from './client';
import type { CursorPage } from './types';
import { fetchAllPages } from './pagination';

export type CustomerSource = 'menu' | 'delivery';
export type CustomerSort = 'last_at' | 'visits' | 'spent' | 'name';

export type RestaurantCustomer = {
  phone_key: string;
  customer_name: string;
  customer_phone: string;
  order_count: number;
  delivery_count: number;
  visit_count: number;
  total_spent_cents: number;
  last_order_at: string;
  first_order_at: string;
  sources: CustomerSource[];
};

export type RestaurantCustomerStats = {
  unique_customers: number;
  repeat_customers: number;
  menu_customers: number;
  delivery_customers: number;
};

export type RestaurantCustomerList = CursorPage<RestaurantCustomer> & {
  stats: RestaurantCustomerStats;
};

export type RestaurantCustomerActivityItem = {
  id: string;
  kind: CustomerSource;
  created_at: string;
  total_cents: number;
  status: string;
  order_type: string | null;
  display_id: string;
};

export type RestaurantCustomerActivity = {
  phone_key: string;
  customer_name: string;
  customer_phone: string;
  items: RestaurantCustomerActivityItem[];
};

export type ListRestaurantCustomersQuery = {
  q?: string;
  source?: CustomerSource;
  sort?: CustomerSort;
};

export function listRestaurantCustomers(
  token: string,
  restaurantId: string,
  limit = 100,
  cursor?: string | null,
  query?: ListRestaurantCustomersQuery,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (query?.q) params.set('q', query.q);
  if (query?.source) params.set('source', query.source);
  if (query?.sort) params.set('sort', query.sort);
  return apiRequest<RestaurantCustomerList>(
    `/restaurants/${restaurantId}/customers?${params}`,
    { token },
  );
}

export function getRestaurantCustomerActivity(
  token: string,
  restaurantId: string,
  phoneKey: string,
) {
  return apiRequest<RestaurantCustomerActivity>(
    `/restaurants/${restaurantId}/customers/${encodeURIComponent(phoneKey)}/activity`,
    { token },
  );
}

export async function listAllRestaurantCustomers(
  token: string,
  restaurantId: string,
  query?: ListRestaurantCustomersQuery,
): Promise<RestaurantCustomerList> {
  let stats: RestaurantCustomerStats = {
    unique_customers: 0,
    repeat_customers: 0,
    menu_customers: 0,
    delivery_customers: 0,
  };
  const items = await fetchAllPages(async (cursor) => {
    const page = await listRestaurantCustomers(token, restaurantId, 100, cursor, query);
    stats = page.stats;
    return page;
  }, 100);
  return { items, next_cursor: null, has_more: false, stats };
}

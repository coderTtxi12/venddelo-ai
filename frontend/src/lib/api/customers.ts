import { apiRequest } from './client';
import type { CursorPage } from './types';

export type CustomerSource = 'menu' | 'delivery';
export type CustomerSort = 'last_at' | 'visits' | 'spent' | 'name';
export type CustomerSortOrder = 'asc' | 'desc';
export type CustomerFrequency = 'new' | 'repeat';
export type CustomerSpend = 'spent' | 'none';
export type CustomerRecency = '7d' | '30d' | '90d';

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
  total: number;
};

export type RestaurantCustomerActivityItem = {
  id: string;
  kind: CustomerSource;
  created_at: string;
  total_cents: number;
  status: string;
  order_type: string | null;
  display_id: string;
  item_quantity?: number;
  delivery_address?: string | null;
  delivery_maps_url?: string | null;
};

export type RestaurantCustomerActivity = {
  phone_key: string;
  customer_name: string;
  customer_phone: string;
  items: RestaurantCustomerActivityItem[];
  last_delivery_address?: string | null;
  last_delivery_maps_url?: string | null;
};

export type ListRestaurantCustomersQuery = {
  q?: string;
  source?: CustomerSource;
  frequency?: CustomerFrequency;
  spend?: CustomerSpend;
  recency?: CustomerRecency;
  sort?: CustomerSort;
  order?: CustomerSortOrder;
  page?: number;
};

export function listRestaurantCustomers(
  token: string,
  restaurantId: string,
  limit = 20,
  query?: ListRestaurantCustomersQuery,
) {
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(query?.page ?? 1),
  });
  if (query?.q) params.set('q', query.q);
  if (query?.source) params.set('source', query.source);
  if (query?.frequency) params.set('frequency', query.frequency);
  if (query?.spend) params.set('spend', query.spend);
  if (query?.recency) params.set('recency', query.recency);
  if (query?.sort) params.set('sort', query.sort);
  if (query?.order) params.set('order', query.order);
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

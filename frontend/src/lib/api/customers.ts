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

export type RestaurantCustomerActivitySummary = {
  menu_count: number;
  delivery_count: number;
  status_delivered: number;
  status_cancelled: number;
  status_in_progress: number;
  status_other: number;
  timeline: string[];
  avg_ticket_cents: number | null;
  avg_item_quantity: number | null;
};

export type RestaurantCustomerActivity = {
  phone_key: string;
  customer_name: string;
  customer_phone: string;
  summary?: RestaurantCustomerActivitySummary;
  items: RestaurantCustomerActivityItem[];
  total: number;
  has_more: boolean;
  next_cursor: string | null;
  last_delivery_address?: string | null;
  last_delivery_maps_url?: string | null;
};

export type ActivityHistorySort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

export type GetRestaurantCustomerActivityQuery = {
  cursor?: string | null;
  limit?: number;
  sort?: ActivityHistorySort;
};

export type ListRestaurantCustomersQuery = {
  q?: string;
  source?: CustomerSource;
  frequency?: CustomerFrequency;
  spend?: CustomerSpend;
  recency?: CustomerRecency;
  sort?: CustomerSort;
  order?: CustomerSortOrder;
  cursor?: string | null;
};

export function listRestaurantCustomers(
  token: string,
  restaurantId: string,
  limit = 20,
  query?: ListRestaurantCustomersQuery,
) {
  const params = new URLSearchParams({
    limit: String(limit),
  });
  if (query?.cursor) params.set('cursor', query.cursor);
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
  query?: GetRestaurantCustomerActivityQuery,
) {
  const params = new URLSearchParams();
  const limit = query?.limit ?? 15;
  params.set('limit', String(limit));
  if (query?.cursor) params.set('cursor', query.cursor);
  if (query?.sort) params.set('sort', query.sort);
  return apiRequest<RestaurantCustomerActivity>(
    `/restaurants/${restaurantId}/customers/${encodeURIComponent(phoneKey)}/activity?${params}`,
    { token },
  );
}

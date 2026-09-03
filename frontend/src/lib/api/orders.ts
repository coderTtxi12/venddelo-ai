import { apiRequest } from './client';
import type { CursorPage, Order, OrderStatus, OrderStatusSummary } from './types';

export type KitchenOrdersListQuery = {
  status?: OrderStatus;
  view?: 'active' | 'archive';
  board?: 'kitchen' | 'history';
};

export type HistoryOrdersListQuery = {
  board: 'history';
  status?: 'delivered' | 'cancelled';
  q?: string;
  type?: 'delivery' | 'takeout';
  payment_method?: 'cash' | 'transfer' | 'card_terminal';
  from?: string;
  to?: string;
  sort?: 'created_at' | 'total_cents';
  order?: 'asc' | 'desc';
};

export function listRestaurantOrders(
  token: string,
  restaurantId: string,
  limit = 50,
  cursor?: string | null,
  query?: KitchenOrdersListQuery | HistoryOrdersListQuery,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (query?.status) params.set('status', query.status);
  if (query && 'view' in query && query.view) params.set('view', query.view);
  if (query?.board) params.set('board', query.board);
  if (query && 'q' in query && query.q) params.set('q', query.q);
  if (query && 'type' in query && query.type) params.set('type', query.type);
  if (query && 'payment_method' in query && query.payment_method) {
    params.set('payment_method', query.payment_method);
  }
  if (query && 'from' in query && query.from) params.set('from', query.from);
  if (query && 'to' in query && query.to) params.set('to', query.to);
  if (query && 'sort' in query && query.sort) params.set('sort', query.sort);
  if (query && 'order' in query && query.order) params.set('order', query.order);
  return apiRequest<CursorPage<Order>>(`/restaurants/${restaurantId}/orders?${params}`, {
    token,
  });
}

export function getRestaurantOrderSummary(
  token: string,
  restaurantId: string,
  board?: 'kitchen' | 'history',
) {
  const params = new URLSearchParams();
  if (board) params.set('board', board);
  const suffix = params.size ? `?${params}` : '';
  return apiRequest<OrderStatusSummary>(`/restaurants/${restaurantId}/orders/summary${suffix}`, {
    token,
  });
}

export function getRestaurantOrder(token: string, restaurantId: string, orderId: string) {
  return apiRequest<Order>(`/restaurants/${restaurantId}/orders/${orderId}`, { token });
}

export function updateRestaurantOrderStatus(
  token: string,
  restaurantId: string,
  orderId: string,
  status: OrderStatus,
  cancellationReason?: string | null,
) {
  return apiRequest<Order>(`/restaurants/${restaurantId}/orders/${orderId}/status`, {
    method: 'POST',
    token,
    body: {
      status,
      cancellation_reason: cancellationReason ?? undefined,
    },
  });
}

export function updateRestaurantOrdersStatusBulk(
  token: string,
  restaurantId: string,
  orderIds: string[],
  status: OrderStatus,
  cancellationReason?: string | null,
) {
  return apiRequest<{ items: Order[]; updated_count: number }>(
    `/restaurants/${restaurantId}/orders/bulk-status`,
    {
      method: 'POST',
      token,
      body: {
        order_ids: orderIds,
        status,
        cancellation_reason: cancellationReason ?? undefined,
      },
    },
  );
}

export function clearKitchenClosedOrders(token: string, restaurantId: string) {
  return apiRequest<{ cleared_count: number }>(`/restaurants/${restaurantId}/orders/kds-clear`, {
    method: 'POST',
    token,
  });
}

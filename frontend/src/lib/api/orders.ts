import { apiRequest } from './client';
import type { CursorPage, Order, OrderStatus, OrderStatusSummary } from './types';

export type KitchenOrdersListQuery = {
  status?: OrderStatus;
  view?: 'active' | 'archive';
};

export function listRestaurantOrders(
  token: string,
  restaurantId: string,
  limit = 50,
  cursor?: string | null,
  query?: KitchenOrdersListQuery,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (query?.status) params.set('status', query.status);
  if (query?.view) params.set('view', query.view);
  return apiRequest<CursorPage<Order>>(`/restaurants/${restaurantId}/orders?${params}`, {
    token,
  });
}

export function getRestaurantOrderSummary(token: string, restaurantId: string) {
  return apiRequest<OrderStatusSummary>(`/restaurants/${restaurantId}/orders/summary`, {
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

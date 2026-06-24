import { apiRequest } from './client';
import type { CursorPage, Order, OrderStatus } from './types';

export function listRestaurantOrders(
  token: string,
  restaurantId: string,
  limit = 50,
  cursor?: string | null,
  status?: OrderStatus | null,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (status) params.set('status', status);
  return apiRequest<CursorPage<Order>>(`/restaurants/${restaurantId}/orders?${params}`, {
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

import { apiRequest } from "./client";
import type { CursorPage, Order, PublicOrderInput } from "./types";

export function listOrders(token: string, restaurantId: string, status?: string) {
  const q = status ? `?limit=50&status=${status}` : "?limit=50";
  return apiRequest<CursorPage<Order>>(
    `/restaurants/${restaurantId}/orders${q}`,
    { token },
  );
}

export function updateOrderStatus(
  token: string,
  restaurantId: string,
  orderId: string,
  status: string,
) {
  return apiRequest<Order>(
    `/restaurants/${restaurantId}/orders/${orderId}/status`,
    { method: "POST", token, body: { status } },
  );
}

export function createPublicOrder(
  subdomain: string,
  data: PublicOrderInput,
  idempotencyKey: string,
) {
  return apiRequest<Order>(`/public/menu/${subdomain}/orders`, {
    method: "POST",
    body: data,
    idempotencyKey,
  });
}

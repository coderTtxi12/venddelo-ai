import { apiRequest } from "./client";
import type { CursorPage, Promotion } from "./types";

export function listPromotions(token: string, restaurantId: string) {
  return apiRequest<CursorPage<Promotion>>(
    `/restaurants/${restaurantId}/promotions?limit=50`,
    { token },
  );
}

export function createPromotion(
  token: string,
  restaurantId: string,
  data: {
    name: string;
    type: string;
    scope: string;
    percent?: number;
  },
) {
  return apiRequest<Promotion>(`/restaurants/${restaurantId}/promotions`, {
    method: "POST",
    token,
    body: { ...data, restaurant_id: restaurantId },
  });
}

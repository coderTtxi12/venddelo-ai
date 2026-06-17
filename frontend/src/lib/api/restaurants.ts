import { apiRequest } from './client';
import type { CursorPage, Restaurant } from './types';

export function listRestaurants(token: string, limit = 20, cursor?: string | null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest<CursorPage<Restaurant>>(`/restaurants?${params}`, { token });
}

export function getRestaurant(token: string, restaurantId: string) {
  return apiRequest<Restaurant>(`/restaurants/${restaurantId}`, { token });
}

export function updateRestaurant(
  token: string,
  restaurantId: string,
  data: Partial<
    Pick<
      Restaurant,
      | 'name'
      | 'address'
      | 'logo_path'
      | 'cover_path'
      | 'whatsapp_phone'
      | 'color_palette'
      | 'original_language'
      | 'status'
    >
  >,
) {
  return apiRequest<Restaurant>(`/restaurants/${restaurantId}`, {
    method: 'PATCH',
    token,
    body: data,
  });
}

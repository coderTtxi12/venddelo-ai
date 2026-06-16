import { apiRequest } from './client';
import type { CursorPage, Restaurant } from './types';

export function listRestaurants(token: string, limit = 20, cursor?: string | null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest<CursorPage<Restaurant>>(`/restaurants?${params}`, { token });
}

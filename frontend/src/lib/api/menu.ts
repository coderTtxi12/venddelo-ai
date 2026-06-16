import { apiRequest } from './client';
import type { Category, CursorPage, Product } from './types';

export function listCategories(
  token: string,
  restaurantId: string,
  limit: number,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest<CursorPage<Category>>(
    `/restaurants/${restaurantId}/categories?${params}`,
    { token },
  );
}

export function listProducts(
  token: string,
  restaurantId: string,
  limit: number,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest<CursorPage<Product>>(
    `/restaurants/${restaurantId}/products?${params}`,
    { token },
  );
}

export function createCategory(
  token: string,
  restaurantId: string,
  data: {
    name: string;
    description?: string | null;
    image_path?: string | null;
    sort_index?: number;
  },
) {
  return apiRequest<Category>(`/restaurants/${restaurantId}/categories`, {
    method: 'POST',
    token,
    body: {
      restaurant_id: restaurantId,
      name: data.name,
      description: data.description ?? null,
      image_path: data.image_path ?? null,
      sort_index: data.sort_index ?? 0,
    },
  });
}

export function updateCategory(
  token: string,
  restaurantId: string,
  categoryId: string,
  data: {
    name?: string;
    description?: string | null;
    image_path?: string | null;
    sort_index?: number;
    is_active?: boolean;
  },
) {
  return apiRequest<Category>(
    `/restaurants/${restaurantId}/categories/${categoryId}`,
    { method: 'PATCH', token, body: data },
  );
}

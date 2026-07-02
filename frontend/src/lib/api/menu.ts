import { DEFAULT_CURRENCY } from '@/lib/currency';
import { apiRequest } from './client';
import type { Category, CategoryDisplayLayout, CursorPage, Product } from './types';

export function listCategories(
  token: string,
  restaurantId: string,
  limit: number,
  cursor?: string | null,
  options?: { includeInactive?: boolean },
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (options?.includeInactive) params.set('include_inactive', 'true');
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
    display_layout?: CategoryDisplayLayout | null;
    is_active?: boolean;
  },
) {
  return apiRequest<Category>(
    `/restaurants/${restaurantId}/categories/${categoryId}`,
    { method: 'PATCH', token, body: data },
  );
}

export function setCategoryProductOrder(
  token: string,
  restaurantId: string,
  categoryId: string,
  productIds: string[],
) {
  return apiRequest<void>(
    `/restaurants/${restaurantId}/categories/${categoryId}/products/order`,
    { method: 'PUT', token, body: { product_ids: productIds } },
  );
}

export function getProduct(token: string, restaurantId: string, productId: string) {
  return apiRequest<Product>(`/restaurants/${restaurantId}/products/${productId}`, { token });
}

export function createProduct(
  token: string,
  restaurantId: string,
  data: {
    name: string;
    description?: string | null;
    price_cents: number;
    currency?: string;
    image_path?: string | null;
    approval_status?: string;
    is_published?: boolean;
    category_ids: string[];
  },
) {
  return apiRequest<Product>(`/restaurants/${restaurantId}/products`, {
    method: 'POST',
    token,
    body: {
      restaurant_id: restaurantId,
      currency: DEFAULT_CURRENCY,
      approval_status: 'approved',
      is_published: true,
      ...data,
    },
  });
}

export function updateProduct(
  token: string,
  restaurantId: string,
  productId: string,
  data: {
    name?: string;
    description?: string | null;
    price_cents?: number;
    currency?: string;
    image_path?: string | null;
    approval_status?: string;
    is_published?: boolean;
    is_active?: boolean;
    category_ids?: string[];
  },
) {
  return apiRequest<Product>(
    `/restaurants/${restaurantId}/products/${productId}`,
    { method: 'PATCH', token, body: data },
  );
}

export type OptionGroupCreateInput = {
  title: string;
  required: boolean;
  selection: 'single' | 'multi';
  min_selections?: number;
  max_selections?: number | null;
  sort_index?: number;
  is_active?: boolean;
  items: { label: string; price_delta_cents: number; sort_index?: number }[];
};

export function createOptionGroup(
  token: string,
  restaurantId: string,
  productId: string,
  data: OptionGroupCreateInput,
) {
  return apiRequest<Product['option_groups'][number]>(
    `/restaurants/${restaurantId}/products/${productId}/option-groups`,
    {
      method: 'POST',
      token,
      body: data,
    },
  );
}

export type OptionGroupUpdateInput = {
  title?: string;
  required?: boolean;
  selection?: 'single' | 'multi';
  min_selections?: number;
  max_selections?: number | null;
  sort_index?: number;
  is_active?: boolean;
};

export function updateOptionGroup(
  token: string,
  restaurantId: string,
  productId: string,
  groupId: string,
  data: OptionGroupUpdateInput,
) {
  return apiRequest<Product['option_groups'][number]>(
    `/restaurants/${restaurantId}/products/${productId}/option-groups/${groupId}`,
    { method: 'PATCH', token, body: data },
  );
}

export function deleteOptionGroup(
  token: string,
  restaurantId: string,
  productId: string,
  groupId: string,
) {
  return apiRequest<void>(
    `/restaurants/${restaurantId}/products/${productId}/option-groups/${groupId}`,
    { method: 'DELETE', token },
  );
}

export function createOptionItem(
  token: string,
  restaurantId: string,
  productId: string,
  groupId: string,
  data: { label: string; price_delta_cents: number; sort_index?: number },
) {
  return apiRequest<Product['option_groups'][number]['items'][number]>(
    `/restaurants/${restaurantId}/products/${productId}/option-groups/${groupId}/items`,
    { method: 'POST', token, body: data },
  );
}

export function deleteOptionItem(
  token: string,
  restaurantId: string,
  productId: string,
  groupId: string,
  itemId: string,
) {
  return apiRequest<void>(
    `/restaurants/${restaurantId}/products/${productId}/option-groups/${groupId}/items/${itemId}`,
    { method: 'DELETE', token },
  );
}

export type OptionItemUpdateInput = {
  label?: string;
  price_delta_cents?: number;
  sort_index?: number;
  is_active?: boolean;
};

export function updateOptionItem(
  token: string,
  restaurantId: string,
  productId: string,
  groupId: string,
  itemId: string,
  data: OptionItemUpdateInput,
) {
  return apiRequest<Product['option_groups'][number]['items'][number]>(
    `/restaurants/${restaurantId}/products/${productId}/option-groups/${groupId}/items/${itemId}`,
    { method: 'PATCH', token, body: data },
  );
}

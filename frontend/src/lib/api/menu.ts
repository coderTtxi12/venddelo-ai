import { apiRequest } from "./client";
import type { Category, CursorPage, FullMenu, Product } from "./types";

export function listCategories(token: string, restaurantId: string) {
  return apiRequest<CursorPage<Category>>(
    `/restaurants/${restaurantId}/categories?limit=100`,
    { token },
  );
}

export function createCategory(
  token: string,
  restaurantId: string,
  data: { name: string; description?: string; sort_index?: number },
) {
  return apiRequest<Category>(`/restaurants/${restaurantId}/categories`, {
    method: "POST",
    token,
    body: { ...data, restaurant_id: restaurantId },
  });
}

export function updateCategory(
  token: string,
  restaurantId: string,
  categoryId: string,
  data: Partial<Category>,
) {
  return apiRequest<Category>(
    `/restaurants/${restaurantId}/categories/${categoryId}`,
    { method: "PATCH", token, body: data },
  );
}

export function listProducts(token: string, restaurantId: string) {
  return apiRequest<CursorPage<Product>>(
    `/restaurants/${restaurantId}/products?limit=100`,
    { token },
  );
}

export function createProduct(
  token: string,
  restaurantId: string,
  data: {
    name: string;
    description?: string;
    price_cents: number;
    category_ids: string[];
    approval_status?: string;
    is_published?: boolean;
  },
) {
  return apiRequest<Product>(`/restaurants/${restaurantId}/products`, {
    method: "POST",
    token,
    body: { ...data, restaurant_id: restaurantId },
  });
}

export function updateProduct(
  token: string,
  restaurantId: string,
  productId: string,
  data: Partial<Product>,
) {
  return apiRequest<Product>(
    `/restaurants/${restaurantId}/products/${productId}`,
    { method: "PATCH", token, body: data },
  );
}

export function publishProduct(
  token: string,
  restaurantId: string,
  productId: string,
) {
  return apiRequest<Product>(
    `/restaurants/${restaurantId}/products/${productId}/publish`,
    { method: "POST", token },
  );
}

export function getPublicMenu(subdomain: string, locale: string) {
  return apiRequest<FullMenu>(
    `/public/menu/${subdomain}?locale=${encodeURIComponent(locale)}`,
  );
}

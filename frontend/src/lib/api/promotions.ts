import { apiRequest } from './client';
import type { CursorPage, Promotion } from './types';

export const PROMOTIONS_PAGE_SIZE = 20;

export type PromotionType = 'percent' | 'amount' | 'combo' | 'bundle';
export type PromotionScope = 'product' | 'category' | 'order';

export type PromotionScheduleInput = {
  weekdays: number[];
  use_time_window: boolean;
  daily_start_time: string | null;
  daily_end_time: string | null;
};

export type PromotionBundleInput = {
  get_quantity: number;
  pay_quantity: number;
  pairing_mode?: 'cross_product' | 'same_product';
};

export type CreateManualPromotionInput = {
  name: string;
  type: PromotionType;
  scope: PromotionScope;
  percent?: number | null;
  amount_cents?: number | null;
  min_order_cents?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  bundle?: PromotionBundleInput | null;
  schedule?: PromotionScheduleInput | null;
  product_ids?: string[];
  category_ids?: string[];
  option_item_ids?: string[];
};

export function listPromotions(
  token: string,
  restaurantId: string,
  limit = PROMOTIONS_PAGE_SIZE,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest<CursorPage<Promotion>>(
    `/restaurants/${restaurantId}/promotions?${params}`,
    { token },
  );
}

export async function listAllPromotions(
  token: string,
  restaurantId: string,
  limit = PROMOTIONS_PAGE_SIZE,
): Promise<Promotion[]> {
  const items: Promotion[] = [];
  let cursor: string | null = null;
  do {
    const page = await listPromotions(token, restaurantId, limit, cursor);
    items.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return items;
}

export function createPromotion(
  token: string,
  restaurantId: string,
  data: CreateManualPromotionInput,
) {
  return apiRequest<Promotion>(`/restaurants/${restaurantId}/promotions`, {
    method: 'POST',
    token,
    body: {
      restaurant_id: restaurantId,
      ...data,
    },
  });
}

export function updatePromotion(
  token: string,
  restaurantId: string,
  promotionId: string,
  data: Partial<CreateManualPromotionInput>,
) {
  return apiRequest<Promotion>(
    `/restaurants/${restaurantId}/promotions/${promotionId}`,
    { method: 'PATCH', token, body: data },
  );
}

export function deletePromotion(token: string, restaurantId: string, promotionId: string) {
  return apiRequest<void>(`/restaurants/${restaurantId}/promotions/${promotionId}`, {
    method: 'DELETE',
    token,
  });
}

export function setPromotionProducts(
  token: string,
  restaurantId: string,
  promotionId: string,
  productIds: string[],
) {
  return apiRequest<void>(
    `/restaurants/${restaurantId}/promotions/${promotionId}/products`,
    { method: 'PUT', token, body: { ids: productIds } },
  );
}

export function setPromotionCategories(
  token: string,
  restaurantId: string,
  promotionId: string,
  categoryIds: string[],
) {
  return apiRequest<void>(
    `/restaurants/${restaurantId}/promotions/${promotionId}/categories`,
    { method: 'PUT', token, body: { ids: categoryIds } },
  );
}

export function setPromotionOptionItems(
  token: string,
  restaurantId: string,
  promotionId: string,
  optionItemIds: string[],
) {
  return apiRequest<void>(
    `/restaurants/${restaurantId}/promotions/${promotionId}/option-items`,
    { method: 'PUT', token, body: { ids: optionItemIds } },
  );
}

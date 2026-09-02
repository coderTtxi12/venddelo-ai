import { apiRequest } from './client';
import type { Coupon, CouponApplication, CursorPage } from './types';

export const COUPONS_PAGE_SIZE = 20;

export type CouponType = 'percent' | 'amount' | 'free_shipping';
export type CouponScope = 'all' | 'category' | 'product';

export type CouponInput = {
  code: string;
  name: string;
  type: CouponType;
  percent?: number | null;
  amount_cents?: number | null;
  scope: CouponScope;
  stock_qty?: number | null;
  starts_on?: string | null;
  expires_on?: string | null;
  recurrence_weekdays?: number[] | null;
  is_active?: boolean;
  product_ids?: string[];
  category_ids?: string[];
};

export function listCoupons(
  token: string,
  restaurantId: string,
  limit = COUPONS_PAGE_SIZE,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest<CursorPage<Coupon>>(`/restaurants/${restaurantId}/coupons?${params}`, {
    token,
  });
}

export async function listAllCoupons(token: string, restaurantId: string): Promise<Coupon[]> {
  const items: Coupon[] = [];
  let cursor: string | null = null;
  do {
    const page = await listCoupons(token, restaurantId, COUPONS_PAGE_SIZE, cursor);
    items.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return items;
}

export function createCoupon(token: string, restaurantId: string, data: CouponInput) {
  return apiRequest<Coupon>(`/restaurants/${restaurantId}/coupons`, {
    method: 'POST',
    token,
    body: { restaurant_id: restaurantId, ...data },
  });
}

export function updateCoupon(
  token: string,
  restaurantId: string,
  couponId: string,
  data: Partial<CouponInput>,
) {
  return apiRequest<Coupon>(`/restaurants/${restaurantId}/coupons/${couponId}`, {
    method: 'PATCH',
    token,
    body: data,
  });
}

export const COUPON_APPLICATIONS_PAGE_SIZE = 20;

export function listCouponApplications(
  token: string,
  restaurantId: string,
  couponId: string,
  limit = COUPON_APPLICATIONS_PAGE_SIZE,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest<CursorPage<CouponApplication>>(
    `/restaurants/${restaurantId}/coupons/${couponId}/applications?${params}`,
    { token },
  );
}

export async function listAllCouponApplications(
  token: string,
  restaurantId: string,
  couponId: string,
): Promise<CouponApplication[]> {
  const items: CouponApplication[] = [];
  let cursor: string | null = null;
  do {
    const page = await listCouponApplications(token, restaurantId, couponId, COUPON_APPLICATIONS_PAGE_SIZE, cursor);
    items.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return items;
}

export function deleteCoupon(token: string, restaurantId: string, couponId: string) {
  return apiRequest<void>(`/restaurants/${restaurantId}/coupons/${couponId}`, {
    method: 'DELETE',
    token,
  });
}

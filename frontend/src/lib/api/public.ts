import { apiRequest } from './client';
import type { Category, Product, Promotion, RestaurantSchedule } from './types';

export type PublicRestaurant = {
  name: string;
  description: string | null;
  subdomain: string;
  logo_path: string | null;
  cover_path: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  takeout_enabled: boolean;
  delivery_enabled: boolean;
  color_palette: string | null;
  digital_menu_theme_id: string;
  digital_menu_promotions_category_enabled: boolean;
  digital_menu_promotions_category_name: string;
  digital_menu_limited_time_category_enabled: boolean;
  digital_menu_limited_time_category_name: string;
  whatsapp_phone: string | null;
  original_language: string;
  timezone: string;
  server_now: string | null;
};

export type PublicPromotionsContext = {
  server_now: string;
  timezone: string;
  local_now: string;
  items: Promotion[];
};

export type PublicMenu = {
  restaurant_id: string;
  categories: Category[];
  products: Product[];
};

export type CartQuoteLine = {
  product_id: string;
  quantity: number;
  unit_base_cents: number;
  options_cents: number;
  discount_cents: number;
  line_total_cents: number;
  badge: string | null;
  applied_promotion_id: string | null;
  promo_warnings?: string[];
};

export type CartQuote = {
  server_now: string;
  timezone: string;
  lines: CartQuoteLine[];
  subtotal_before_discount_cents: number;
  order_discount_cents: number;
  total_cents: number;
  applied_order_promotion_id: string | null;
};

export type CartQuoteInput = {
  items: {
    product_id: string;
    quantity: number;
    selected_options?: Record<string, string[]>;
  }[];
};

export function getPublicRestaurant(subdomain: string) {
  return apiRequest<PublicRestaurant>(`/public/restaurants/${encodeURIComponent(subdomain)}`);
}

export function getPublicMenu(subdomain: string, locale = 'default') {
  const params = new URLSearchParams({ locale });
  return apiRequest<PublicMenu>(
    `/public/menu/${encodeURIComponent(subdomain)}?${params}`,
  );
}

export function getPublicRestaurantSchedules(subdomain: string) {
  return apiRequest<RestaurantSchedule[]>(
    `/public/restaurants/${encodeURIComponent(subdomain)}/schedules`,
  );
}

export function getPublicRestaurantPromotions(subdomain: string) {
  return apiRequest<PublicPromotionsContext>(
    `/public/restaurants/${encodeURIComponent(subdomain)}/promotions`,
  );
}

export function quoteCart(subdomain: string, data: CartQuoteInput) {
  return apiRequest<CartQuote>(
    `/public/restaurants/${encodeURIComponent(subdomain)}/cart/quote`,
    { method: 'POST', body: data },
  );
}

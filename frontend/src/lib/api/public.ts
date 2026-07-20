import { apiRequest, type RequestOptions } from './client';
import type { Category, Product, Promotion, RestaurantSchedule } from './types';
import type { PaymentMethodKey } from '@/lib/restaurantPaymentConfig';
import type { RestaurantServiceType } from '@/lib/restaurantServices';
import type { PublicRestaurantSocialLinks } from '@/lib/digital-menu/restaurantSocialLinks';

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
  social_links: PublicRestaurantSocialLinks | null;
  social_placement: string;
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

export type PublicCheckoutPaymentMethod = {
  method: PaymentMethodKey;
  service_type: RestaurantServiceType;
};

export type PublicDeliveryService = {
  available: boolean;
  reason: string | null;
  partnership_status: 'none' | 'pending' | 'active' | 'suspended';
  provider_name: string | null;
};

export type PublicCheckoutConfig = {
  takeout_enabled: boolean;
  delivery_enabled: boolean;
  payment_methods: PublicCheckoutPaymentMethod[];
  delivery_service: PublicDeliveryService | null;
};

export type PublicDeliveryQuote = {
  available: boolean;
  reason: string | null;
  delivery_fee_cents: number;
  inside_polygon: boolean;
  distance_km: number | null;
  provider_name: string | null;
  partnership_status: 'none' | 'pending' | 'active' | 'suspended';
  weather_mode: DeliveryWeatherMode;
};

export type DeliveryWeatherMode = 'none' | 'light' | 'heavy' | 'intense';

export type PublicDeliveryQuoteInput = {
  latitude: number;
  longitude: number;
};

export type PublicOrderItemInput = {
  product_id: string;
  quantity: number;
  selected_options?: Record<string, string[]>;
};

export type PublicOrderInput = {
  type: RestaurantServiceType;
  customer_name: string;
  customer_phone: string;
  payment_method: PaymentMethodKey;
  delivery_address?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  delivery_fee_cents?: number;
  cash_denomination_cents?: number;
  note?: string;
  items: PublicOrderItemInput[];
};

export function getPublicRestaurant(subdomain: string, requestOptions?: RequestOptions) {
  return apiRequest<PublicRestaurant>(
    `/public/restaurants/${encodeURIComponent(subdomain)}`,
    requestOptions,
  );
}

export function getPublicMenu(
  subdomain: string,
  locale = 'default',
  requestOptions?: RequestOptions,
) {
  const params = new URLSearchParams({ locale });
  return apiRequest<PublicMenu>(
    `/public/menu/${encodeURIComponent(subdomain)}?${params}`,
    requestOptions,
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

export function getPublicCheckoutConfig(subdomain: string) {
  return apiRequest<PublicCheckoutConfig>(
    `/public/restaurants/${encodeURIComponent(subdomain)}/checkout-config`,
  );
}

export function quotePublicDelivery(subdomain: string, data: PublicDeliveryQuoteInput) {
  return apiRequest<PublicDeliveryQuote>(
    `/public/restaurants/${encodeURIComponent(subdomain)}/delivery-quote`,
    { method: 'POST', body: data },
  );
}

export function createPublicOrder(
  subdomain: string,
  data: PublicOrderInput,
  idempotencyKey?: string,
) {
  return apiRequest<{ id: string }>(
    `/public/menu/${encodeURIComponent(subdomain)}/orders`,
    { method: 'POST', body: data, idempotencyKey },
  );
}

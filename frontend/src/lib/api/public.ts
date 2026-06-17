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
  whatsapp_phone: string | null;
  original_language: string;
};

export type PublicMenu = {
  restaurant_id: string;
  categories: Category[];
  products: Product[];
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
  return apiRequest<Promotion[]>(
    `/public/restaurants/${encodeURIComponent(subdomain)}/promotions`,
  );
}

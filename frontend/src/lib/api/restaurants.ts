import { apiRequest } from './client';
import type {
  CursorPage,
  Restaurant,
  RestaurantPaymentMethod,
  RestaurantSchedule,
  RestaurantScheduleCreateInput,
  SubdomainAvailability,
} from './types';

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
      | 'subdomain'
      | 'description'
      | 'address'
      | 'latitude'
      | 'longitude'
      | 'place_id'
      | 'logo_path'
      | 'cover_path'
      | 'digital_menu_theme_id'
      | 'whatsapp_phone'
      | 'color_palette'
      | 'original_language'
      | 'status'
      | 'takeout_enabled'
      | 'delivery_enabled'
    >
  >,
) {
  return apiRequest<Restaurant>(`/restaurants/${restaurantId}`, {
    method: 'PATCH',
    token,
    body: data,
  });
}

export function checkRestaurantSubdomainAvailability(
  token: string,
  subdomain: string,
  excludeRestaurantId?: string | null,
) {
  const params = new URLSearchParams({ subdomain });
  if (excludeRestaurantId) params.set('exclude', excludeRestaurantId);
  return apiRequest<SubdomainAvailability>(`/restaurants/check-subdomain?${params}`, { token });
}

export function listRestaurantSchedules(token: string, restaurantId: string) {
  return apiRequest<RestaurantSchedule[]>(`/restaurants/${restaurantId}/schedules`, { token });
}

export function listRestaurantPaymentMethods(token: string, restaurantId: string) {
  return apiRequest<RestaurantPaymentMethod[]>(`/restaurants/${restaurantId}/payment-methods`, {
    token,
  });
}

export function setRestaurantSchedules(
  token: string,
  restaurantId: string,
  schedules: RestaurantScheduleCreateInput[],
) {
  return apiRequest<void>(`/restaurants/${restaurantId}/schedules`, {
    method: 'PUT',
    token,
    body: schedules,
  });
}

export function setRestaurantPaymentMethods(
  token: string,
  restaurantId: string,
  methods: Array<{
    method: RestaurantPaymentMethod['method'];
    service_type: RestaurantPaymentMethod['service_type'];
    enabled: boolean;
  }>,
) {
  return apiRequest<void>(`/restaurants/${restaurantId}/payment-methods`, {
    method: 'PUT',
    token,
    body: methods,
  });
}

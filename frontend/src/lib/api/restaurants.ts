import { apiRequest } from './client';
import type {
  CursorPage,
  DeliveryProviderPaymentMethod,
  DeliveryProviderSchedule,
  Restaurant,
  RestaurantAccessListResponse,
  RestaurantAdminInvite,
  RestaurantDeliveryPartnershipResponse,
  RestaurantMeResponse,
  RestaurantMember,
  RestaurantPaymentMethod,
  RestaurantSchedule,
  RestaurantScheduleCreateInput,
  SubdomainAvailability,
} from './types';

export function createRestaurant(
  token: string,
  data: {
    name: string;
    subdomain: string;
    original_language?: string;
    status?: string;
    description?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    place_id?: string | null;
    whatsapp_phone?: string | null;
    owner_contact_name?: string | null;
    owner_phone?: string | null;
    takeout_enabled?: boolean;
    delivery_enabled?: boolean;
    branch_count?: number | null;
  },
) {
  return apiRequest<Restaurant>('/restaurants', {
    method: 'POST',
    token,
    body: data,
  });
}

export function listRestaurants(token: string, limit = 20, cursor?: string | null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest<CursorPage<Restaurant>>(`/restaurants?${params}`, { token });
}

export function getMyRestaurant(token: string, restaurantId?: string | null) {
  const params = new URLSearchParams();
  if (restaurantId) params.set('restaurant_id', restaurantId);
  const query = params.toString();
  return apiRequest<RestaurantMeResponse>(`/restaurants/me${query ? `?${query}` : ''}`, {
    token,
  });
}

export function listMyRestaurantAccess(token: string) {
  return apiRequest<RestaurantAccessListResponse>('/restaurants/me/access', { token });
}

export function selectMyRestaurant(token: string, restaurantId: string) {
  return apiRequest<RestaurantMeResponse>('/restaurants/me/select', {
    method: 'POST',
    token,
    body: { restaurant_id: restaurantId },
  });
}

const ACTIVE_RESTAURANT_STORAGE_PREFIX = 'venddelo:active-restaurant:';

export function getStoredRestaurantId(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(`${ACTIVE_RESTAURANT_STORAGE_PREFIX}${userId}`);
}

export function setStoredRestaurantId(userId: string, restaurantId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${ACTIVE_RESTAURANT_STORAGE_PREFIX}${userId}`, restaurantId);
}

/** Resolves restaurant access for the panel (orders, settings, gate). */
export async function resolveMyRestaurantAccess(
  token: string,
  options?: { userId?: string | null; restaurantId?: string | null },
): Promise<RestaurantMeResponse> {
  const preferredId =
    options?.restaurantId ?? (options?.userId ? getStoredRestaurantId(options.userId) : null);

  try {
    const me = await getMyRestaurant(token, preferredId);
    if (me.restaurant) {
      return me;
    }
  } catch (error) {
    console.warn('getMyRestaurant failed', error);
  }

  try {
    const page = await listRestaurants(token, 1);
    const owned = page.items[0];
    if (owned) {
      return { restaurant: owned, member_role: 'owner' };
    }
  } catch (error) {
    console.error('listRestaurants failed', error);
  }

  return { restaurant: null, member_role: null };
}

export function listMyRestaurantAdminInvites(token: string) {
  return apiRequest<RestaurantAdminInvite[]>('/restaurants/me/admin-invites', { token });
}

export function listMyRestaurantMembers(token: string) {
  return apiRequest<RestaurantMember[]>('/restaurants/me/members', { token });
}

export function addMyRestaurantAdminInvite(token: string, email: string) {
  return apiRequest<RestaurantAdminInvite>('/restaurants/me/admin-invites', {
    method: 'POST',
    token,
    body: { email },
  });
}

export function removeMyRestaurantAdminInvite(token: string, inviteId: string) {
  return apiRequest<void>(`/restaurants/me/admin-invites/${inviteId}`, {
    method: 'DELETE',
    token,
  });
}

export function removeMyRestaurantAdminMember(token: string, memberId: string) {
  return apiRequest<void>(`/restaurants/me/members/${memberId}`, {
    method: 'DELETE',
    token,
  });
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
      | 'digital_menu_promotions_category_enabled'
      | 'digital_menu_promotions_category_name'
      | 'digital_menu_limited_time_category_enabled'
      | 'digital_menu_limited_time_category_name'
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

export function getRestaurantDeliveryPartnership(token: string, restaurantId: string) {
  return apiRequest<RestaurantDeliveryPartnershipResponse>(
    `/restaurants/${restaurantId}/delivery-partnership`,
    { token },
  );
}

export function requestRestaurantDeliveryPartnership(token: string, restaurantId: string) {
  return apiRequest<RestaurantDeliveryPartnershipResponse>(
    `/restaurants/${restaurantId}/delivery-partnership/request`,
    {
      method: 'POST',
      token,
    },
  );
}

export function listActiveDeliveryProviderSchedules(token: string, restaurantId: string) {
  return apiRequest<DeliveryProviderSchedule[]>(
    `/restaurants/${restaurantId}/delivery-partnership/schedules`,
    { token },
  );
}

export function listActiveDeliveryProviderPaymentMethods(token: string, restaurantId: string) {
  return apiRequest<DeliveryProviderPaymentMethod[]>(
    `/restaurants/${restaurantId}/delivery-partnership/payment-methods`,
    { token },
  );
}

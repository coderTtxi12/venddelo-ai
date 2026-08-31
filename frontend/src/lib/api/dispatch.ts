import { apiRequest } from './client';

export type DispatchStatus =
  | 'scheduled'
  | 'searching'
  | 'offered'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'unassigned'
  | 'cancelled';

export type DispatchAssignedRider = {
  first_name: string;
  photo_url: string | null;
  plate_suffix: string;
  vehicle_type: string;
  motorcycle_brand: string;
  motorcycle_color: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
};

export type DispatchRequest = {
  id: string;
  order_id?: string | null;
  customer_name: string;
  customer_phone: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  dropoff_maps_url: string | null;
  payment_method: 'cash' | 'transfer' | 'card_terminal';
  collect_cents: number;
  cash_denomination_cents: number | null;
  package_size: 'normal' | 'grande';
  package_count: number;
  ready_at: string;
  search_at: string;
  next_attempt_at: string;
  quoted_fee_cents: number;
  status: DispatchStatus;
  assigned_driver_id: string | null;
  tracking_token: string;
  short_id: string;
  notes: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  rider?: DispatchAssignedRider | null;
  credit_hold_status: 'held' | 'released' | null;
  credit_hold_cents: number;
};

export type DispatchLeadTime = {
  prep_minutes: number;
  search_ahead_minutes: number;
};

export type DispatchCreateInput = {
  customer_name: string;
  customer_phone: string;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  dropoff_address: string;
  dropoff_maps_url: string | null;
  payment_method: 'cash' | 'transfer' | 'card_terminal';
  collect_cents: number;
  cash_denomination_cents: number | null;
  package_size: 'normal' | 'grande';
  package_count: number;
  prep_minutes: number;
  notes: string | null;
  order_id?: string | null;
};

export type PublicDispatchTracking = {
  status: DispatchStatus;
  short_id: string;
  restaurant_name: string | null;
  customer_name: string;
  pickup: {
    latitude: number;
    longitude: number;
    name: string;
  } | null;
  dropoff: {
    latitude: number;
    longitude: number;
    address: string;
  };
  rider: {
    first_name: string;
    photo_url: string | null;
    plate_suffix: string;
    vehicle_type: string;
    motorcycle_brand: string;
    motorcycle_color: string;
    latitude: number | null;
    longitude: number | null;
    phone: string;
  } | null;
  eta_seconds: number | null;
  package_count: number;
  payment_method: 'cash' | 'transfer' | 'card_terminal';
  collect_cents: number | null;
  cash_denomination_cents: number | null;
};

export type MapsUrlResolve = {
  latitude: number;
  longitude: number;
  resolved_url: string | null;
  address?: string | null;
};

export function formatDispatchShortId(shortId: string | null | undefined): string {
  const value = (shortId ?? '').trim().toUpperCase();
  if (!value) return '';
  return value.startsWith('#') ? value : `#${value}`;
}

export function isDispatchHistoryStatus(status: DispatchStatus): boolean {
  return status === 'delivered' || status === 'cancelled';
}

function restaurantQuery(restaurantId: string): string {
  return new URLSearchParams({ restaurant_id: restaurantId }).toString();
}

export function listDispatchRequests(token: string, restaurantId: string) {
  return apiRequest<DispatchRequest[]>(
    `/restaurants/me/dispatch-requests?${restaurantQuery(restaurantId)}`,
    { token, cache: 'no-store' },
  );
}

export function listDispatchLeadTimes(token: string, restaurantId: string) {
  return apiRequest<DispatchLeadTime[]>(
    `/restaurants/me/dispatch-lead-times?${restaurantQuery(restaurantId)}`,
    { token },
  );
}

export function resolveDispatchMapsUrl(token: string, restaurantId: string, url: string) {
  const params = new URLSearchParams({ restaurant_id: restaurantId, url });
  return apiRequest<MapsUrlResolve>(
    `/restaurants/me/resolve-maps-url?${params.toString()}`,
    { token },
  );
}

export function createDispatchRequest(
  token: string,
  restaurantId: string,
  input: DispatchCreateInput,
) {
  return apiRequest<DispatchRequest>(
    `/restaurants/me/dispatch-requests?${restaurantQuery(restaurantId)}`,
    { method: 'POST', token, body: input },
  );
}

export function patchDispatchRequest(
  token: string,
  restaurantId: string,
  requestId: string,
  input: Pick<DispatchCreateInput, 'payment_method' | 'collect_cents' | 'cash_denomination_cents'>,
) {
  return apiRequest<DispatchRequest>(
    `/restaurants/me/dispatch-requests/${requestId}?${restaurantQuery(restaurantId)}`,
    { method: 'PATCH', token, body: input },
  );
}

export function cancelDispatchRequest(token: string, restaurantId: string, requestId: string) {
  return apiRequest<DispatchRequest>(
    `/restaurants/me/dispatch-requests/${requestId}/cancel?${restaurantQuery(restaurantId)}`,
    { method: 'POST', token },
  );
}

export function retryDispatchRequest(token: string, restaurantId: string, requestId: string) {
  return apiRequest<DispatchRequest>(
    `/restaurants/me/dispatch-requests/${requestId}/retry?${restaurantQuery(restaurantId)}`,
    { method: 'POST', token },
  );
}

export function confirmDispatchCash(token: string, restaurantId: string, requestId: string) {
  return apiRequest<DispatchRequest>(
    `/restaurants/me/dispatch-requests/${requestId}/confirm-rider-cash?${restaurantQuery(restaurantId)}`,
    { method: 'POST', token },
  );
}

export function getPublicDispatchTracking(token: string) {
  return apiRequest<PublicDispatchTracking>(
    `/public/dispatch-tracking/${encodeURIComponent(token)}`,
    { cache: 'no-store' },
  );
}

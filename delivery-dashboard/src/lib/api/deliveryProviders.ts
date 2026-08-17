import { apiRequest } from './client';
import type {
  DeliveryAssignmentSettings,
  DeliveryAssignmentSettingsUpdate,
  DeliveryProvider,
  DeliveryProviderAdminInvite,
  DeliveryProviderMember,
  DeliveryProviderMeResponse,
  DeliveryProviderPricingResponse,
  DeliveryProviderPricingUpdate,
  DeliveryProviderPaymentMethod,
  DeliveryProviderPaymentMethodUpdate,
  DeliveryProviderProfileUpdate,
  DeliveryProviderSchedule,
  DeliveryProviderScheduleCreateInput,
  DeliveryProviderServiceStatus,
  DeliveryProviderServiceStatusUpdate,
  DeliveryProviderWeatherModeUpdate,
  DeliveryProviderZone,
  DeliveryProviderZoneWrite,
  DeliveryPricingQuote,
  DeliveryPricingSimulateRequest,
  DeliverySearchLeadTime,
  DeliverySearchLeadTimeUpdate,
  DeliveryDriver,
  DeliveryDriverCreateInput,
  DeliveryDriverDocumentsUpdateInput,
  DeliveryDriverUpdateInput,
} from './types';

function withZoneId(path: string, zoneId: string): string {
  return `${path}?zone_id=${encodeURIComponent(zoneId)}`;
}

export function getMyDeliveryProvider(token: string) {
  return apiRequest<DeliveryProviderMeResponse>('/delivery-providers/me', { token });
}

export function listMyDeliveryProviderZones(token: string) {
  return apiRequest<DeliveryProviderZone[]>('/delivery-providers/me/zones', { token });
}

export function getMyDeliveryProviderZone(token: string, zoneId: string) {
  return apiRequest<DeliveryProviderZone>(`/delivery-providers/me/zones/${zoneId}`, { token });
}

export function createMyDeliveryProviderZone(token: string, body: DeliveryProviderZoneWrite) {
  return apiRequest<DeliveryProviderZone>('/delivery-providers/me/zones', {
    method: 'POST',
    token,
    body,
  });
}

export function patchMyDeliveryProviderZone(
  token: string,
  zoneId: string,
  body: DeliveryProviderZoneWrite,
) {
  return apiRequest<DeliveryProviderZone>(`/delivery-providers/me/zones/${zoneId}`, {
    method: 'PATCH',
    token,
    body,
  });
}

export function deleteMyDeliveryProviderZone(token: string, zoneId: string) {
  return apiRequest<void>(`/delivery-providers/me/zones/${zoneId}`, {
    method: 'DELETE',
    token,
  });
}

export function listMyDeliveryProviderAdminInvites(token: string) {
  return apiRequest<DeliveryProviderAdminInvite[]>('/delivery-providers/me/admin-invites', {
    token,
  });
}

export function listMyDeliveryProviderMembers(token: string) {
  return apiRequest<DeliveryProviderMember[]>('/delivery-providers/me/members', {
    token,
  });
}

export function addMyDeliveryProviderAdminInvite(
  token: string,
  email: string,
  memberRole: 'admin' | 'operator' = 'admin',
) {
  return apiRequest<DeliveryProviderAdminInvite>('/delivery-providers/me/admin-invites', {
    method: 'POST',
    token,
    body: { email, member_role: memberRole },
  });
}

export function removeMyDeliveryProviderAdminInvite(token: string, inviteId: string) {
  return apiRequest<void>(`/delivery-providers/me/admin-invites/${inviteId}`, {
    method: 'DELETE',
    token,
  });
}

export function updateMyDeliveryProvider(token: string, body: DeliveryProviderProfileUpdate) {
  return apiRequest<DeliveryProvider>('/delivery-providers/me', {
    method: 'PATCH',
    token,
    body,
  });
}

export function listMyDeliveryProviderSchedules(token: string, zoneId: string) {
  return apiRequest<DeliveryProviderSchedule[]>(
    withZoneId('/delivery-providers/me/schedules', zoneId),
    { token },
  );
}

export function setMyDeliveryProviderSchedules(
  token: string,
  zoneId: string,
  schedules: DeliveryProviderScheduleCreateInput[],
) {
  return apiRequest<void>(withZoneId('/delivery-providers/me/schedules', zoneId), {
    method: 'PUT',
    token,
    body: schedules,
  });
}

export function listMyDeliveryProviderPaymentMethods(token: string) {
  return apiRequest<DeliveryProviderPaymentMethod[]>('/delivery-providers/me/payment-methods', {
    token,
  });
}

export function setMyDeliveryProviderPaymentMethods(
  token: string,
  methods: DeliveryProviderPaymentMethodUpdate[],
) {
  return apiRequest<DeliveryProviderPaymentMethod[]>('/delivery-providers/me/payment-methods', {
    method: 'PUT',
    token,
    body: methods,
  });
}

export function getMyDeliveryProviderServiceStatus(token: string, zoneId: string) {
  return apiRequest<DeliveryProviderServiceStatus>(
    withZoneId('/delivery-providers/me/service-status', zoneId),
    { token },
  );
}

export function updateMyDeliveryProviderServiceStatus(
  token: string,
  zoneId: string,
  body: DeliveryProviderServiceStatusUpdate,
) {
  return apiRequest<DeliveryProviderServiceStatus>(
    withZoneId('/delivery-providers/me/service-status', zoneId),
    {
      method: 'PATCH',
      token,
      body,
    },
  );
}

export function getMyDeliveryProviderPricing(token: string, zoneId: string) {
  return apiRequest<DeliveryProviderPricingResponse>(
    withZoneId('/delivery-providers/me/pricing', zoneId),
    { token },
  );
}

export function updateMyDeliveryProviderPricing(
  token: string,
  zoneId: string,
  body: DeliveryProviderPricingUpdate,
) {
  return apiRequest<DeliveryProviderPricingResponse>(
    withZoneId('/delivery-providers/me/pricing', zoneId),
    {
      method: 'PUT',
      token,
      body,
    },
  );
}

export function updateMyDeliveryProviderWeatherMode(
  token: string,
  zoneId: string,
  body: DeliveryProviderWeatherModeUpdate,
) {
  return apiRequest<DeliveryProviderPricingResponse>(
    withZoneId('/delivery-providers/me/pricing/weather-mode', zoneId),
    {
      method: 'PATCH',
      token,
      body,
    },
  );
}

export function simulateMyDeliveryProviderPricing(
  token: string,
  zoneId: string,
  body: DeliveryPricingSimulateRequest,
) {
  return apiRequest<DeliveryPricingQuote>(
    withZoneId('/delivery-providers/me/pricing/simulate', zoneId),
    {
      method: 'POST',
      token,
      body,
    },
  );
}

export function getMyDeliveryProviderAssignmentSettings(token: string) {
  return apiRequest<DeliveryAssignmentSettings>('/delivery-providers/me/assignment-settings', {
    token,
  });
}

export function patchMyDeliveryProviderAssignmentSettings(
  token: string,
  body: DeliveryAssignmentSettingsUpdate,
) {
  return apiRequest<DeliveryAssignmentSettings>('/delivery-providers/me/assignment-settings', {
    method: 'PATCH',
    token,
    body,
  });
}

export function getMyDeliveryProviderSearchLeadTimes(token: string) {
  return apiRequest<DeliverySearchLeadTime[]>('/delivery-providers/me/search-lead-times', {
    token,
  });
}

export function patchMyDeliveryProviderSearchLeadTimes(
  token: string,
  body: DeliverySearchLeadTimeUpdate[],
) {
  return apiRequest<DeliverySearchLeadTime[]>('/delivery-providers/me/search-lead-times', {
    method: 'PATCH',
    token,
    body,
  });
}

export function listMyDeliveryDrivers(token: string) {
  return apiRequest<DeliveryDriver[]>('/delivery-providers/me/drivers', { token });
}

export function createMyDeliveryDriver(token: string, body: DeliveryDriverCreateInput) {
  return apiRequest<DeliveryDriver>('/delivery-providers/me/drivers', {
    method: 'POST',
    token,
    body,
  });
}

export function getMyDeliveryDriver(token: string, driverId: string) {
  return apiRequest<DeliveryDriver>(`/delivery-providers/me/drivers/${driverId}`, { token });
}

export function patchMyDeliveryDriver(
  token: string,
  driverId: string,
  body: DeliveryDriverUpdateInput,
) {
  return apiRequest<DeliveryDriver>(`/delivery-providers/me/drivers/${driverId}`, {
    method: 'PATCH',
    token,
    body,
  });
}

export function uploadMyDeliveryDriverDocuments(
  token: string,
  driverId: string,
  body: DeliveryDriverDocumentsUpdateInput,
) {
  return apiRequest<DeliveryDriver>(`/delivery-providers/me/drivers/${driverId}/documents`, {
    method: 'POST',
    token,
    body,
  });
}

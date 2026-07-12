import { apiRequest } from './client';
import type {
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
  DeliveryPricingQuote,
  DeliveryPricingSimulateRequest,
} from './types';

export function getMyDeliveryProvider(token: string) {
  return apiRequest<DeliveryProviderMeResponse>('/delivery-providers/me', { token });
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

export function addMyDeliveryProviderAdminInvite(token: string, email: string) {
  return apiRequest<DeliveryProviderAdminInvite>('/delivery-providers/me/admin-invites', {
    method: 'POST',
    token,
    body: { email },
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

export function listMyDeliveryProviderSchedules(token: string) {
  return apiRequest<DeliveryProviderSchedule[]>('/delivery-providers/me/schedules', { token });
}

export function setMyDeliveryProviderSchedules(
  token: string,
  schedules: DeliveryProviderScheduleCreateInput[],
) {
  return apiRequest<void>('/delivery-providers/me/schedules', {
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

export function getMyDeliveryProviderServiceStatus(token: string) {
  return apiRequest<DeliveryProviderServiceStatus>('/delivery-providers/me/service-status', {
    token,
  });
}

export function updateMyDeliveryProviderServiceStatus(
  token: string,
  body: DeliveryProviderServiceStatusUpdate,
) {
  return apiRequest<DeliveryProviderServiceStatus>('/delivery-providers/me/service-status', {
    method: 'PATCH',
    token,
    body,
  });
}

export function getMyDeliveryProviderPricing(token: string) {
  return apiRequest<DeliveryProviderPricingResponse>('/delivery-providers/me/pricing', { token });
}

export function updateMyDeliveryProviderPricing(
  token: string,
  body: DeliveryProviderPricingUpdate,
) {
  return apiRequest<DeliveryProviderPricingResponse>('/delivery-providers/me/pricing', {
    method: 'PUT',
    token,
    body,
  });
}

export function updateMyDeliveryProviderWeatherMode(
  token: string,
  body: DeliveryProviderWeatherModeUpdate,
) {
  return apiRequest<DeliveryProviderPricingResponse>('/delivery-providers/me/pricing/weather-mode', {
    method: 'PATCH',
    token,
    body,
  });
}

export function simulateMyDeliveryProviderPricing(
  token: string,
  body: DeliveryPricingSimulateRequest,
) {
  return apiRequest<DeliveryPricingQuote>('/delivery-providers/me/pricing/simulate', {
    method: 'POST',
    token,
    body,
  });
}

import { apiRequest } from './client';
import type {
  DeliveryProvider,
  DeliveryProviderMeResponse,
  DeliveryProviderProfileUpdate,
  DeliveryProviderSchedule,
  DeliveryProviderScheduleCreateInput,
  DeliveryProviderServiceStatus,
  DeliveryProviderServiceStatusUpdate,
} from './types';

export function getMyDeliveryProvider(token: string) {
  return apiRequest<DeliveryProviderMeResponse>('/delivery-providers/me', { token });
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

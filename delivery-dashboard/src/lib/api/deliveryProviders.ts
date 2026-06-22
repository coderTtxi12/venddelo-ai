import { apiRequest } from './client';
import type {
  DeliveryProvider,
  DeliveryProviderMeResponse,
  DeliveryProviderProfileUpdate,
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

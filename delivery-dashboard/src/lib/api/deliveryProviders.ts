import { apiRequest } from './client';
import type { DeliveryProviderMeResponse } from './types';

export function getMyDeliveryProvider(token: string) {
  return apiRequest<DeliveryProviderMeResponse>('/delivery-providers/me', { token });
}

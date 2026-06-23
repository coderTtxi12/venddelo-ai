import { apiRequest } from './client';
import type { DeliveryPartnershipRequest } from './types';

export function listPartnershipRequests(token: string) {
  return apiRequest<DeliveryPartnershipRequest[]>('/delivery-providers/me/partnership-requests', {
    token,
  });
}

export function listActivePartnerships(token: string) {
  return apiRequest<DeliveryPartnershipRequest[]>('/delivery-providers/me/partnerships', {
    token,
  });
}

export function acceptPartnershipRequest(token: string, linkId: string) {
  return apiRequest<DeliveryPartnershipRequest>(
    `/delivery-providers/me/partnership-requests/${linkId}/accept`,
    {
      method: 'POST',
      token,
    },
  );
}

export function rejectPartnershipRequest(token: string, linkId: string) {
  return apiRequest<void>(`/delivery-providers/me/partnership-requests/${linkId}/reject`, {
    method: 'POST',
    token,
  });
}

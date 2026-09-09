import { apiRequest } from './client';
import { partnershipListPath, type PartnershipListKind, type PartnershipListQuery } from './partnershipQuery';
import type { DeliveryPartnershipListPage, DeliveryPartnershipRequest } from './types';

export type { PartnershipListQuery } from './partnershipQuery';

export function listPartnershipRequests(token: string, query: PartnershipListQuery = {}) {
  return apiRequest<DeliveryPartnershipListPage>(partnershipListPath('pending', query), {
    token,
  });
}

export function listActivePartnerships(token: string, query: PartnershipListQuery = {}) {
  return apiRequest<DeliveryPartnershipListPage>(partnershipListPath('active', query), {
    token,
  });
}

export function listPartnerships(
  token: string,
  kind: PartnershipListKind,
  query: PartnershipListQuery = {},
) {
  return kind === 'pending'
    ? listPartnershipRequests(token, query)
    : listActivePartnerships(token, query);
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

export function updatePartnership(
  token: string,
  linkId: string,
  body: { zone_id?: string; has_web_app?: boolean; on_hold?: boolean },
) {
  return apiRequest<DeliveryPartnershipRequest>(`/delivery-providers/me/partnerships/${linkId}`, {
    method: 'PATCH',
    token,
    body,
  });
}

export function reassignPartnershipZone(token: string, linkId: string, zoneId: string) {
  return updatePartnership(token, linkId, { zone_id: zoneId });
}

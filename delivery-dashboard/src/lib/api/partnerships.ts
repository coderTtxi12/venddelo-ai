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

const PARTNERSHIP_FETCH_LIMIT = 100;

export async function listAllActivePartnerships(token: string): Promise<DeliveryPartnershipRequest[]> {
  const items: DeliveryPartnershipRequest[] = [];
  let offset = 0;
  for (;;) {
    const page = await listActivePartnerships(token, {
      limit: PARTNERSHIP_FETCH_LIMIT,
      offset,
      sort: 'activated_at',
    });
    items.push(...page.items);
    if (!page.has_more || page.items.length === 0) return items;
    offset += page.items.length;
  }
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

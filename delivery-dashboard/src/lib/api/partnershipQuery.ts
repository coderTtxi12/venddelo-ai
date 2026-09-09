export const PARTNERSHIP_PAGE_SIZE = 20;

export type PartnershipListKind = 'pending' | 'active';

export type PartnershipSort =
  | 'name'
  | '-name'
  | 'email'
  | '-email'
  | 'created_at'
  | '-created_at'
  | 'activated_at'
  | '-activated_at'
  | 'has_web_app'
  | '-has_web_app';

export type PartnershipListQuery = {
  zoneId?: string | null;
  q?: string;
  hasWebApp?: boolean | null;
  onHold?: boolean | null;
  sort?: PartnershipSort;
  limit?: number;
  offset?: number;
};

export function defaultPartnershipSort(kind: PartnershipListKind): PartnershipSort {
  return kind === 'pending' ? '-created_at' : '-activated_at';
}

export function partnershipListPath(kind: PartnershipListKind, query: PartnershipListQuery = {}): string {
  const base =
    kind === 'pending'
      ? '/delivery-providers/me/partnership-requests'
      : '/delivery-providers/me/partnerships';
  const params = new URLSearchParams();
  if (query.zoneId) params.set('zone_id', query.zoneId);
  const q = query.q?.trim();
  if (q) params.set('q', q);
  if (query.hasWebApp != null) params.set('has_web_app', String(query.hasWebApp));
  if (query.onHold != null) params.set('on_hold', String(query.onHold));
  if (query.sort) params.set('sort', query.sort);
  params.set('limit', String(query.limit ?? PARTNERSHIP_PAGE_SIZE));
  params.set('offset', String(query.offset ?? 0));
  return `${base}?${params.toString()}`;
}

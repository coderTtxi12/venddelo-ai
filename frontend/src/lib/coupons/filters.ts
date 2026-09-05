import type { Coupon, CouponEffectiveStatus, CouponType } from '@/lib/api/types';

export type CouponStatusFilter = 'all' | CouponEffectiveStatus;
export type CouponTypeFilter = 'all' | CouponType;
export type CouponSort = 'code' | 'uses' | 'expiry' | 'created';
export type CouponSortOrder = 'asc' | 'desc';

export type CouponListFilters = {
  query: string;
  status: CouponStatusFilter;
  type: CouponTypeFilter;
};

export const COUPON_STATUS_FILTER_LABELS: Record<CouponStatusFilter, string> = {
  all: 'Todos',
  active: 'Activos',
  scheduled: 'Programados',
  inactive: 'Pausados',
  expired: 'Expirados',
  sold_out: 'Agotados',
};

export const COUPON_TYPE_FILTER_LABELS: Record<CouponTypeFilter, string> = {
  all: 'Todos',
  percent: 'Porcentaje',
  amount: 'Monto fijo',
  free_shipping: 'Envío gratis',
};

export const COUPON_SORT_COLUMN_LABELS: Record<CouponSort, string> = {
  code: 'Código',
  uses: 'Usos',
  expiry: 'Caducidad',
  created: 'Creado',
};

export const COUPON_MOBILE_SORT_OPTIONS: Record<string, string> = {
  'created:desc': 'Más recientes',
  'created:asc': 'Más antiguos',
  'code:asc': 'Código A–Z',
  'code:desc': 'Código Z–A',
  'uses:desc': 'Más usos',
  'uses:asc': 'Menos usos',
  'expiry:asc': 'Caducan antes',
  'expiry:desc': 'Caducan después',
};

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function matchesQuery(coupon: Coupon, query: string): boolean {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  const haystack = normalizeSearch(`${coupon.code} ${coupon.name}`);
  return haystack.includes(normalized);
}

export function couponFiltersActive(filters: CouponListFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.status !== 'all' ||
    filters.type !== 'all'
  );
}

export function filterCoupons(coupons: Coupon[], filters: CouponListFilters): Coupon[] {
  return coupons.filter((coupon) => {
    if (!matchesQuery(coupon, filters.query)) return false;
    if (filters.status !== 'all' && coupon.effective_status !== filters.status) return false;
    if (filters.type !== 'all' && coupon.type !== filters.type) return false;
    return true;
  });
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, 'es-MX', { sensitivity: 'base' });
}

function expirySortValue(expiresOn: string | null): number {
  if (!expiresOn) return Number.MAX_SAFE_INTEGER;
  const time = new Date(`${expiresOn}T12:00:00`).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

export function sortCoupons(
  coupons: Coupon[],
  sort: CouponSort,
  order: CouponSortOrder,
): Coupon[] {
  const direction = order === 'asc' ? 1 : -1;
  const sorted = [...coupons].sort((left, right) => {
    let result = 0;
    if (sort === 'code') {
      result = compareStrings(left.code, right.code);
    } else if (sort === 'uses') {
      result = left.redeemed_count - right.redeemed_count;
    } else if (sort === 'expiry') {
      result = expirySortValue(left.expires_on) - expirySortValue(right.expires_on);
    } else {
      result = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    }
    if (result === 0) result = compareStrings(left.code, right.code);
    return result * direction;
  });
  return sorted;
}

export function toggleCouponColumnSort(
  current: { sort: CouponSort; order: CouponSortOrder },
  column: CouponSort,
): { sort: CouponSort; order: CouponSortOrder } {
  if (current.sort !== column) {
    return {
      sort: column,
      order: column === 'code' ? 'asc' : 'desc',
    };
  }
  return { sort: column, order: current.order === 'desc' ? 'asc' : 'desc' };
}

export function computeCouponStats(coupons: Coupon[]) {
  return {
    total: coupons.length,
    active: coupons.filter((coupon) => coupon.effective_status === 'active').length,
    uses: coupons.reduce((sum, coupon) => sum + coupon.redeemed_count, 0),
    inactive: coupons.filter(
      (coupon) =>
        coupon.effective_status === 'inactive' ||
        coupon.effective_status === 'expired' ||
        coupon.effective_status === 'sold_out',
    ).length,
  };
}

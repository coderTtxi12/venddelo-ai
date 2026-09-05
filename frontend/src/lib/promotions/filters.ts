import type { Promotion } from '@/lib/api/types';
import { PRODUCT_CATALOG_DISCOUNT_PREFIX } from './productCatalogDiscount';

export type PromotionStatusFilter =
  | 'all'
  | 'active'
  | 'scheduled'
  | 'expired'
  | 'outside_schedule'
  | 'inactive';
export type PromotionTemplateFilter =
  | 'all'
  | 'product_discount'
  | 'bundle'
  | 'combo'
  | 'order_threshold'
  | 'catalog';
export type PromotionSort = 'name' | 'status' | 'created';
export type PromotionSortOrder = 'asc' | 'desc';

export type PromotionListFilters = {
  query: string;
  status: PromotionStatusFilter;
  template: PromotionTemplateFilter;
};

export const PROMOTION_STATUS_FILTER_LABELS: Record<PromotionStatusFilter, string> = {
  all: 'Todos',
  active: 'Vigentes',
  scheduled: 'Programadas',
  expired: 'Expiradas',
  outside_schedule: 'Fuera de horario',
  inactive: 'Pausadas',
};

export const PROMOTION_TEMPLATE_FILTER_LABELS: Record<PromotionTemplateFilter, string> = {
  all: 'Todos',
  product_discount: 'Descuento en producto',
  bundle: 'N×M',
  combo: 'Combo',
  order_threshold: 'Umbral de carrito',
  catalog: 'Desde catálogo',
};

export const PROMOTION_SORT_COLUMN_LABELS: Record<PromotionSort, string> = {
  name: 'Nombre',
  status: 'Estado',
  created: 'Creado',
};

export const PROMOTION_MOBILE_SORT_OPTIONS: Record<string, string> = {
  'created:desc': 'Más recientes',
  'created:asc': 'Más antiguos',
  'name:asc': 'Nombre A–Z',
  'name:desc': 'Nombre Z–A',
  'status:asc': 'Estado A–Z',
  'status:desc': 'Estado Z–A',
};

export function isCatalogPromotion(promotion: Promotion): boolean {
  return promotion.name.startsWith(PRODUCT_CATALOG_DISCOUNT_PREFIX);
}

export function promotionTemplate(promotion: Promotion): PromotionTemplateFilter {
  if (isCatalogPromotion(promotion)) return 'catalog';
  if (promotion.type === 'combo') return 'combo';
  if (promotion.type === 'bundle' || promotion.type === '2x1') return 'bundle';
  if (promotion.scope === 'order') return 'order_threshold';
  if (promotion.type === 'percent' || promotion.type === 'amount') return 'product_discount';
  return 'product_discount';
}

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function matchesQuery(promotion: Promotion, query: string): boolean {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  const displayName = promotion.name.startsWith(PRODUCT_CATALOG_DISCOUNT_PREFIX)
    ? promotion.name.slice(PRODUCT_CATALOG_DISCOUNT_PREFIX.length)
    : promotion.name;
  return normalizeSearch(displayName).includes(normalized);
}

export function promotionFiltersActive(filters: PromotionListFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.status !== 'all' ||
    filters.template !== 'all'
  );
}

export function filterPromotions(
  promotions: Promotion[],
  filters: PromotionListFilters,
): Promotion[] {
  return promotions.filter((promotion) => {
    if (!matchesQuery(promotion, filters.query)) return false;
    if (filters.status !== 'all' && promotion.effective_status !== filters.status) return false;
    if (filters.template !== 'all' && promotionTemplate(promotion) !== filters.template) {
      return false;
    }
    return true;
  });
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, 'es-MX', { sensitivity: 'base' });
}

function displayName(promotion: Promotion): string {
  if (promotion.name.startsWith(PRODUCT_CATALOG_DISCOUNT_PREFIX)) {
    return promotion.name.slice(PRODUCT_CATALOG_DISCOUNT_PREFIX.length).trim() || '(descuento de producto)';
  }
  return promotion.name;
}

export function sortPromotions(
  promotions: Promotion[],
  sort: PromotionSort,
  order: PromotionSortOrder,
): Promotion[] {
  const direction = order === 'asc' ? 1 : -1;
  return [...promotions].sort((left, right) => {
    let result = 0;
    if (sort === 'name') {
      result = compareStrings(displayName(left), displayName(right));
    } else if (sort === 'status') {
      result = compareStrings(left.effective_status ?? '', right.effective_status ?? '');
    } else {
      result = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    }
    if (result === 0) result = compareStrings(displayName(left), displayName(right));
    return result * direction;
  });
}

export function togglePromotionColumnSort(
  current: { sort: PromotionSort; order: PromotionSortOrder },
  column: PromotionSort,
): { sort: PromotionSort; order: PromotionSortOrder } {
  if (current.sort !== column) {
    return {
      sort: column,
      order: column === 'name' ? 'asc' : 'desc',
    };
  }
  return {
    sort: column,
    order: current.order === 'asc' ? 'desc' : 'asc',
  };
}

export function computePromotionStats(promotions: Promotion[]) {
  const active = promotions.filter((p) => p.effective_status === 'active').length;
  const scheduled = promotions.filter((p) => p.effective_status === 'scheduled').length;
  const withBanner = promotions.filter((p) => p.show_banner !== false && !isCatalogPromotion(p)).length;
  return {
    total: promotions.length,
    active,
    scheduled,
    withBanner,
  };
}

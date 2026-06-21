import type { Product, Promotion } from '@/lib/api/types';
import { isPromotionEffective } from './effective';
import { PRODUCT_CATALOG_DISCOUNT_PREFIX } from './productCatalogDiscount';

export function isPromotionShortcutCandidate(promotion: Promotion): boolean {
  if (promotion.name.startsWith(PRODUCT_CATALOG_DISCOUNT_PREFIX)) return false;
  if (promotion.scope === 'order') return false;
  if (!promotion.image_path?.trim()) return false;
  return true;
}

export function productsParticipatingInPromotion(
  products: Product[],
  promotion: Promotion,
): Product[] {
  if (promotion.scope === 'product') {
    const ids = new Set(promotion.product_ids);
    return products.filter((product) => ids.has(product.id));
  }

  if (promotion.scope === 'category') {
    const categoryIds = new Set(promotion.category_ids);
    const explicitProductIds = new Set(promotion.product_ids);
    return products.filter((product) => {
      const inCategory = product.category_ids.some((id) => categoryIds.has(id));
      if (!inCategory) return false;
      if (promotion.product_ids.length > 0) {
        return explicitProductIds.has(product.id);
      }
      return true;
    });
  }

  return [];
}

export function listLivePromotionShortcuts(
  promotions: Promotion[],
  products: Product[],
  now: Date,
  timezone: string,
): Promotion[] {
  return promotions
    .filter(isPromotionShortcutCandidate)
    .filter((promotion) => isPromotionEffective(promotion, now, timezone))
    .filter((promotion) => productsParticipatingInPromotion(products, promotion).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

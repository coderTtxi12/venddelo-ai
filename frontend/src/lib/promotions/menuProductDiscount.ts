import type { Product, Promotion } from '@/lib/api/types';
import { isPromotionEffective } from './effective';
import { discountUsdFromPromotion } from './productCatalogDiscount';

export type MenuProductDiscountInfo = {
  amountOff: number;
  finalPrice: number;
  badge: string | null;
};

function promotionAppliesToProduct(promotion: Promotion, product: Product): boolean {
  if (promotion.scope === 'product') {
    return promotion.product_ids.includes(product.id);
  }
  if (promotion.scope === 'category') {
    return promotion.category_ids.some((categoryId) => product.category_ids.includes(categoryId));
  }
  return false;
}

function bundleBadge(promotion: Promotion): string | null {
  if (promotion.type !== 'bundle' && promotion.type !== '2x1') return null;
  const getQ = promotion.bundle?.get_quantity ?? 2;
  const payQ = promotion.bundle?.pay_quantity ?? 1;
  return `${getQ}×${payQ}`;
}

function specialOfferBadge(promotion: Promotion): string | null {
  if (promotion.type === 'combo') return 'Combo';
  return bundleBadge(promotion);
}

function percentBadge(promotion: Promotion): string | null {
  if (promotion.type === 'percent' && promotion.percent != null) {
    return `-${promotion.percent}%`;
  }
  return null;
}

export function resolveMenuProductDiscount(
  product: Product,
  promotions: Promotion[],
  now: Date,
  timezone = 'America/Mexico_City',
): MenuProductDiscountInfo | null {
  const price = product.price_cents / 100;
  const applicable = promotions.filter(
    (promotion) =>
      isPromotionEffective(promotion, now, timezone) &&
      promotionAppliesToProduct(promotion, product),
  );

  if (applicable.length === 0) return null;

  let bestAmountOff = 0;
  let bestPercentBadge: string | null = null;
  let specialBadge: string | null = null;

  for (const promotion of applicable) {
    const special = specialOfferBadge(promotion);
    if (special) {
      specialBadge = special;
      continue;
    }

    if (promotion.type === 'percent' || promotion.type === 'amount') {
      const amountOff = discountUsdFromPromotion(promotion, price);
      if (amountOff > bestAmountOff) {
        bestAmountOff = amountOff;
        bestPercentBadge = percentBadge(promotion);
      }
    }
  }

  if (bestAmountOff <= 0 && !specialBadge) return null;

  return {
    amountOff: bestAmountOff,
    finalPrice: Math.max(0, Math.round((price - bestAmountOff) * 100) / 100),
    badge: bestPercentBadge ?? specialBadge,
  };
}

export function buildMenuProductDiscountMap(
  products: Product[],
  promotions: Promotion[],
  now: Date,
  timezone = 'America/Mexico_City',
): Map<string, MenuProductDiscountInfo> {
  const discounts = new Map<string, MenuProductDiscountInfo>();

  for (const product of products) {
    const info = resolveMenuProductDiscount(product, promotions, now, timezone);
    if (info) {
      discounts.set(product.id, info);
    }
  }

  return discounts;
}

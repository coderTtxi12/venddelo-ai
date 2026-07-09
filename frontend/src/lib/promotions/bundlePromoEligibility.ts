import type { Product, Promotion } from '@/lib/api/types';
import { isPromotionEffective } from '@/lib/promotions/effective';

export type BundleComplementRules = {
  promoName: string;
  promoBadge: string;
  allowedOptionItemIds: Set<string>;
};

function bundlePromoShortBadge(promotion: Promotion): string {
  const getQ = promotion.bundle?.get_quantity ?? 2;
  const payQ = promotion.bundle?.pay_quantity ?? 1;
  return `${getQ}×${payQ}`;
}

function isNxmBundlePromo(promotion: Promotion): boolean {
  return (
    (promotion.type === 'bundle' || promotion.type === '2x1') &&
    (promotion.scope === 'product' || promotion.scope === 'category')
  );
}

function promoAppliesToProduct(promotion: Promotion, product: Product): boolean {
  if (promotion.scope === 'product') {
    return promotion.product_ids.includes(product.id);
  }
  if (promotion.scope === 'category') {
    const inCategory = product.category_ids.some((id) => promotion.category_ids.includes(id));
    if (!inCategory) return false;
    if (promotion.product_ids.length > 0) {
      return promotion.product_ids.includes(product.id);
    }
    return true;
  }
  return false;
}

export function getBundleComplementRulesForProduct(
  product: Product,
  promotions: Promotion[],
  now: Date,
  timezone: string,
): BundleComplementRules | null {
  for (const promotion of promotions) {
    if (!isNxmBundlePromo(promotion)) continue;
    if (!isPromotionEffective(promotion, now, timezone)) continue;
    if (!promoAppliesToProduct(promotion, product)) continue;
    return {
      promoName: promotion.name,
      promoBadge: bundlePromoShortBadge(promotion),
      allowedOptionItemIds: new Set(promotion.option_item_ids ?? []),
    };
  }
  return null;
}

export function isOptionExcludedFromBundlePromo(
  optionItemId: string,
  rules: BundleComplementRules | null,
): boolean {
  if (!rules) return false;
  return !rules.allowedOptionItemIds.has(optionItemId);
}

export const BUNDLE_COMPLEMENT_EXCLUDED_MESSAGE =
  'Este complemento no participa en la promoción. La oferta no aplicará si lo eliges.';

export function bundleComplementExcludedBadge(promoBadge: string): string {
  return `Fuera de promo · ${promoBadge}`;
}

export function bundleComplementExcludedTitle(promoName: string): string {
  return `${BUNDLE_COMPLEMENT_EXCLUDED_MESSAGE} Promoción: ${promoName}.`;
}

export const PROMO_WARNING_COMPLEMENT_EXCLUDED = 'complement_excluded';

export function promoWarningLabel(code: string): string | null {
  if (code === PROMO_WARNING_COMPLEMENT_EXCLUDED) {
    return 'Un complemento elegido está fuera de la promoción.';
  }
  return null;
}

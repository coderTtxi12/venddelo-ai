import { activeOptionGroups } from '@/components/digital-menu/optionGroupHint';
import { getGroupSelection } from '@/components/digital-menu/productOptionSelection';
import type { CartQuoteLine } from '@/lib/api/public';
import type { Product, Promotion } from '@/lib/api/types';
import { isPromotionEffective } from '@/lib/promotions/effective';
import { PROMO_WARNING_COMPLEMENT_EXCLUDED } from '@/lib/promotions/bundlePromoEligibility';
import {
  isCatalogProductDiscountPromotion,
  PRODUCT_CATALOG_DISCOUNT_PREFIX,
} from '@/lib/promotions/productCatalogDiscount';
import type { PublicMenuCartLine } from './types';

export type CheckoutOptionRow = {
  groupTitle: string;
  label: string;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type CheckoutOptionGroup = {
  groupTitle: string;
  items: CheckoutOptionRow[];
  groupLineTotalCents: number;
};

export type CheckoutDiscountDetail = {
  promotionId: string;
  label: string;
  badge: string | null;
  discountCents: number;
  applied: boolean;
  notAppliedReason: string | null;
};

export type CheckoutLineBreakdown = {
  cartLine: PublicMenuCartLine;
  quoteLine: CartQuoteLine;
  baseUnitCents: number;
  baseLineCents: number;
  options: CheckoutOptionRow[];
  optionGroups: CheckoutOptionGroup[];
  optionsLineCents: number;
  subtotalBeforeDiscountCents: number;
  discountCents: number;
  lineTotalCents: number;
  promoBadge: string | null;
  promoLabel: string | null;
  discountDetails: CheckoutDiscountDetail[];
  promoWarnings: string[];
};

export function promotionDisplayName(promotion: Promotion | undefined): string | null {
  if (!promotion) return null;
  if (promotion.name.startsWith(PRODUCT_CATALOG_DISCOUNT_PREFIX)) {
    return 'Descuento en producto';
  }
  return promotion.name;
}

function promotionAppliesToProduct(promotion: Promotion, product: Product): boolean {
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

function isPercentOrAmountPromo(promotion: Promotion): boolean {
  return promotion.type === 'percent' || promotion.type === 'amount';
}

function isBundlePromo(promotion: Promotion): boolean {
  return promotion.type === 'bundle' || promotion.type === '2x1';
}

function isRelevantLinePromo(promotion: Promotion): boolean {
  return (
    (promotion.scope === 'product' || promotion.scope === 'category') &&
    promotion.type !== 'combo'
  );
}

function bundleShortBadge(promotion: Promotion): string | null {
  if (!isBundlePromo(promotion)) return null;
  const getQ = promotion.bundle?.get_quantity ?? 2;
  const payQ = promotion.bundle?.pay_quantity ?? 1;
  return `${getQ}×${payQ}`;
}

function percentShortBadge(promotion: Promotion): string | null {
  if (promotion.type === 'percent' && promotion.percent != null) {
    return `-${promotion.percent}%`;
  }
  return null;
}

function promoDisplayLabel(promotion: Promotion): string {
  const catalogName = promotionDisplayName(promotion);
  if (catalogName) return catalogName;
  return promotion.name;
}

function catalogDiscountPerUnitCents(product: Product, promotion: Promotion): number {
  const base = product.price_cents;
  if (promotion.type === 'amount' && promotion.amount_cents != null) {
    return Math.min(promotion.amount_cents, base);
  }
  if (promotion.type === 'percent' && promotion.percent != null) {
    return Math.round((base * promotion.percent) / 100);
  }
  return 0;
}

function isBundleAppliedOnLine(promotion: Promotion, quoteLine: CartQuoteLine): boolean {
  return (
    promotion.id === quoteLine.applied_promotion_id &&
    quoteLine.discount_cents > 0 &&
    quoteLine.badge != null
  );
}

function bundleNotAppliedReason(promotion: Promotion, quantity: number): string | null {
  const getQ = promotion.bundle?.get_quantity ?? 2;
  if (quantity < getQ) {
    return `Requiere al menos ${getQ} unidades para activarse`;
  }
  return null;
}

function bundleNotAppliedReasonForLine(
  promotion: Promotion,
  quantity: number,
  quoteLine: CartQuoteLine,
): string | null {
  if (
    lineHasComplementExcludedWarning(quoteLine) &&
    (promotion.option_item_ids?.length ?? 0) > 0
  ) {
    return 'Complemento fuera de la promoción';
  }
  return bundleNotAppliedReason(promotion, quantity);
}

function lineHasComplementExcludedWarning(quoteLine: CartQuoteLine): boolean {
  return quoteLine.promo_warnings?.includes(PROMO_WARNING_COMPLEMENT_EXCLUDED) ?? false;
}

function quoteLineDiscountCents(
  subtotalBeforeDiscountCents: number,
  quoteLine: CartQuoteLine,
): number {
  return Math.max(0, subtotalBeforeDiscountCents - quoteLine.line_total_cents);
}

function computePercentOrAmountDiscountCents(
  promotion: Promotion,
  subtotalCents: number,
): number {
  if (promotion.type === 'percent' && promotion.percent != null) {
    return Math.round((subtotalCents * promotion.percent) / 100);
  }
  if (promotion.type === 'amount' && promotion.amount_cents != null) {
    return Math.min(promotion.amount_cents, subtotalCents);
  }
  return 0;
}

type AllocatedDiscounts = {
  catalogCents: number;
  bundleByPromoId: Map<string, number>;
  linePromoById: Map<string, number>;
};

function allocateStackedDiscounts(
  product: Product,
  quantity: number,
  optionsCentsPerUnit: number,
  subtotalBeforeDiscountCents: number,
  lineTotalCents: number,
  quoteLine: CartQuoteLine,
  promotions: Promotion[],
  timezone: string,
  now: Date,
): AllocatedDiscounts {
  const actualTotalDiscount = Math.max(0, subtotalBeforeDiscountCents - lineTotalCents);
  const bundleByPromoId = new Map<string, number>();
  const linePromoById = new Map<string, number>();

  const catalogPromo = promotions.find(
    (promotion) =>
      isCatalogProductDiscountPromotion(promotion, product.id) &&
      isPromotionEffective(promotion, now, timezone),
  );

  const catalogPerUnit = catalogPromo ? catalogDiscountPerUnitCents(product, catalogPromo) : 0;

  const bundlePromos = promotions.filter(
    (promotion) =>
      isBundlePromo(promotion) &&
      isPromotionEffective(promotion, now, timezone) &&
      promotionAppliesToProduct(promotion, product),
  );

  const appliedBundle = bundlePromos.find(
    (promotion) => promotion.id === quoteLine.applied_promotion_id,
  );

  let catalogCents = catalogPerUnit * quantity;
  let bundleCents = 0;

  if (appliedBundle) {
    bundleCents = actualTotalDiscount;
    if (bundleCents > 0) {
      bundleByPromoId.set(appliedBundle.id, bundleCents);
      catalogCents = 0;
    }
  }

  const allocated = catalogCents + bundleCents;

  if (allocated > actualTotalDiscount && allocated > 0) {
    catalogCents = Math.max(0, actualTotalDiscount - bundleCents);
  } else if (allocated < actualTotalDiscount) {
    if (bundleCents > 0) {
      catalogCents = actualTotalDiscount - bundleCents;
    } else if (catalogPromo) {
      catalogCents = actualTotalDiscount;
    } else {
      const appliedLinePromo = promotions.find(
        (promotion) => promotion.id === quoteLine.applied_promotion_id,
      );
      if (appliedLinePromo && isPercentOrAmountPromo(appliedLinePromo)) {
        linePromoById.set(appliedLinePromo.id, actualTotalDiscount);
      }
      catalogCents = 0;
    }
  }

  if (catalogCents < 0) catalogCents = 0;

  return { catalogCents, bundleByPromoId, linePromoById };
}

function buildDiscountDetails(
  product: Product | undefined,
  quantity: number,
  optionsCentsPerUnit: number,
  subtotalBeforeDiscountCents: number,
  quoteLine: CartQuoteLine,
  promotions: Promotion[],
  timezone: string,
  now: Date,
): CheckoutDiscountDetail[] {
  if (!product) return [];

  const lineTotalCents = quoteLine.line_total_cents;
  const allocation = allocateStackedDiscounts(
    product,
    quantity,
    optionsCentsPerUnit,
    subtotalBeforeDiscountCents,
    lineTotalCents,
    quoteLine,
    promotions,
    timezone,
    now,
  );

  const catalogPromo = promotions.find((promotion) =>
    isCatalogProductDiscountPromotion(promotion, product.id),
  );

  const details: CheckoutDiscountDetail[] = [];
  const bundleAppliedOnLine = promotions.some(
    (promotion) => isBundlePromo(promotion) && isBundleAppliedOnLine(promotion, quoteLine),
  );

  for (const promotion of promotions) {
    if (!isRelevantLinePromo(promotion)) continue;
    if (!isPromotionEffective(promotion, now, timezone)) continue;
    if (!promotionAppliesToProduct(promotion, product)) continue;

    if (isCatalogProductDiscountPromotion(promotion, product.id)) {
      if (bundleAppliedOnLine) continue;
      const discountCents = allocation.catalogCents;
      details.push({
        promotionId: promotion.id,
        label: promoDisplayLabel(promotion),
        badge: percentShortBadge(promotion),
        discountCents,
        applied: discountCents > 0,
        notAppliedReason: discountCents > 0 ? null : null,
      });
      continue;
    }

    if (isBundlePromo(promotion)) {
      const isAppliedOnLine = isBundleAppliedOnLine(promotion, quoteLine);
      const lineDiscountCents = isAppliedOnLine
        ? quoteLineDiscountCents(subtotalBeforeDiscountCents, quoteLine)
        : 0;

      details.push({
        promotionId: promotion.id,
        label: promoDisplayLabel(promotion),
        badge: bundleShortBadge(promotion),
        discountCents: lineDiscountCents,
        applied: isAppliedOnLine,
        notAppliedReason: isAppliedOnLine
          ? null
          : bundleNotAppliedReasonForLine(promotion, quantity, quoteLine),
      });
      continue;
    }

    if (isPercentOrAmountPromo(promotion)) {
      const allocated = allocation.linePromoById.get(promotion.id);
      const discountCents =
        allocated ??
        (promotion.id === quoteLine.applied_promotion_id
          ? Math.max(0, subtotalBeforeDiscountCents - lineTotalCents)
          : computePercentOrAmountDiscountCents(promotion, subtotalBeforeDiscountCents));

      const applied =
        discountCents > 0 &&
        (promotion.id === quoteLine.applied_promotion_id || allocated != null);

      details.push({
        promotionId: promotion.id,
        label: promoDisplayLabel(promotion),
        badge: percentShortBadge(promotion),
        discountCents: applied ? discountCents : 0,
        applied,
        notAppliedReason: applied ? null : null,
      });
    }
  }

  details.sort((a, b) => {
    if (a.applied !== b.applied) return a.applied ? -1 : 1;
    return b.discountCents - a.discountCents;
  });

  const explainedDiscount = details
    .filter((detail) => detail.applied)
    .reduce((sum, detail) => sum + detail.discountCents, 0);
  const actualDiscount = Math.max(0, subtotalBeforeDiscountCents - lineTotalCents);

  if (explainedDiscount === 0 && actualDiscount > 0) {
    if (catalogPromo) {
      details.unshift({
        promotionId: catalogPromo.id,
        label: promoDisplayLabel(catalogPromo),
        badge: quoteLine.badge,
        discountCents: actualDiscount,
        applied: true,
        notAppliedReason: null,
      });
    } else {
      details.unshift({
        promotionId: quoteLine.applied_promotion_id ?? 'line-discount',
        label: 'Descuento',
        badge: quoteLine.badge,
        discountCents: actualDiscount,
        applied: true,
        notAppliedReason: null,
      });
    }
  }

  return details;
}

function groupOptionsByTitle(options: CheckoutOptionRow[]): CheckoutOptionGroup[] {
  const groups: CheckoutOptionGroup[] = [];
  const indexByTitle = new Map<string, number>();

  for (const option of options) {
    const existingIndex = indexByTitle.get(option.groupTitle);
    if (existingIndex == null) {
      indexByTitle.set(option.groupTitle, groups.length);
      groups.push({
        groupTitle: option.groupTitle,
        items: [option],
        groupLineTotalCents: option.lineTotalCents,
      });
      continue;
    }

    const group = groups[existingIndex]!;
    group.items.push(option);
    group.groupLineTotalCents += option.lineTotalCents;
  }

  return groups;
}

export function buildCheckoutLineBreakdowns(
  lines: PublicMenuCartLine[],
  quoteLines: CartQuoteLine[],
  productsById: ReadonlyMap<string, Product>,
  promotionsById: ReadonlyMap<string, Promotion>,
  timezone: string,
  now: Date,
): CheckoutLineBreakdown[] {
  const promotions = [...promotionsById.values()];

  return lines.map((cartLine, index) => {
    const quoteLine = quoteLines[index]!;
    const product = productsById.get(cartLine.productId);
    const quantity = cartLine.quantity;
    const baseUnitCents = quoteLine.unit_base_cents;
    const baseLineCents = baseUnitCents * quantity;

    const options: CheckoutOptionRow[] = [];
    if (product) {
      for (const group of activeOptionGroups(product)) {
        const selectedIds = new Set(getGroupSelection(cartLine.selections, group.id));
        for (const item of group.items) {
          if (!selectedIds.has(item.id)) continue;
          options.push({
            groupTitle: group.title,
            label: item.label,
            unitPriceCents: item.price_delta_cents,
            lineTotalCents: item.price_delta_cents * quantity,
          });
        }
      }
    }

    const optionGroups = groupOptionsByTitle(options);
    const optionsCentsPerUnit = quoteLine.options_cents;
    const optionsLineCents = optionsCentsPerUnit * quantity;
    const subtotalBeforeDiscountCents = baseLineCents + optionsLineCents;
    const appliedPromo = quoteLine.applied_promotion_id
      ? promotionsById.get(quoteLine.applied_promotion_id)
      : undefined;

    const discountCents = Math.max(
      0,
      subtotalBeforeDiscountCents - quoteLine.line_total_cents,
    );

    const discountDetails = buildDiscountDetails(
      product,
      quantity,
      optionsCentsPerUnit,
      subtotalBeforeDiscountCents,
      quoteLine,
      promotions,
      timezone,
      now,
    );

    return {
      cartLine,
      quoteLine,
      baseUnitCents,
      baseLineCents,
      options,
      optionGroups,
      optionsLineCents,
      subtotalBeforeDiscountCents,
      discountCents,
      lineTotalCents: quoteLine.line_total_cents,
      promoBadge:
        quoteLine.discount_cents > 0 && quoteLine.badge ? quoteLine.badge : null,
      promoLabel:
        quoteLine.discount_cents > 0 && quoteLine.badge
          ? quoteLine.badge
          : promotionDisplayName(appliedPromo),
      discountDetails,
      promoWarnings: quoteLine.promo_warnings ?? [],
    };
  });
}

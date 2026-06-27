import type { AppliedOrderDiscount, OrderItem, Product, Promotion } from '@/lib/api/types';
import {
  isCatalogProductDiscountPromotion,
  PRODUCT_CATALOG_DISCOUNT_PREFIX,
} from '@/lib/promotions/productCatalogDiscount';

function isBundlePromo(promotion: Promotion): boolean {
  return promotion.type === 'bundle' || promotion.type === '2x1';
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

function promoDisplayLabel(promotion: Promotion): string {
  if (promotion.name.startsWith(PRODUCT_CATALOG_DISCOUNT_PREFIX)) {
    return 'Descuento de producto';
  }
  return promotion.name;
}

function percentShortBadge(promotion: Promotion): string | null {
  if (promotion.type === 'percent' && promotion.percent != null) {
    return `-${promotion.percent}%`;
  }
  return null;
}

function bundleShortBadge(promotion: Promotion): string | null {
  const getQ = promotion.bundle?.get_quantity ?? 2;
  const payQ = promotion.bundle?.pay_quantity ?? 1;
  return `${getQ}×${payQ}`;
}

function allocateStackedDiscountCents(
  item: OrderItem,
  product: Product,
  promotions: Promotion[],
): { catalogCents: number; bundleCents: number; bundlePromo: Promotion | null } {
  const actualTotalDiscount = Math.max(0, item.line_subtotal_cents - item.line_total_cents);
  const catalogPromo = promotions.find((promotion) =>
    isCatalogProductDiscountPromotion(promotion, product.id),
  );
  const catalogPerUnit = catalogPromo ? catalogDiscountPerUnitCents(product, catalogPromo) : 0;

  const bundlePromo = item.applied_promotion_id
    ? promotions.find(
        (promotion) => promotion.id === item.applied_promotion_id && isBundlePromo(promotion),
      ) ?? null
    : null;

  if (bundlePromo && catalogPerUnit > 0) {
    return {
      catalogCents: catalogPerUnit * item.quantity,
      bundleCents: item.discount_cents,
      bundlePromo,
    };
  }

  return { catalogCents: 0, bundleCents: actualTotalDiscount, bundlePromo };
}

function buildDiscountSnapshots(
  item: OrderItem,
  product: Product | undefined,
  promotions: Promotion[],
): AppliedOrderDiscount[] {
  if (!product) return [];

  const { catalogCents, bundleCents, bundlePromo } = allocateStackedDiscountCents(
    item,
    product,
    promotions,
  );

  const snapshots: AppliedOrderDiscount[] = [];
  const catalogPromo = promotions.find((promotion) =>
    isCatalogProductDiscountPromotion(promotion, product.id),
  );

  if (catalogPromo && catalogCents > 0) {
    snapshots.push({
      label: promoDisplayLabel(catalogPromo),
      badge: percentShortBadge(catalogPromo),
      discount_cents: catalogCents,
      applied: true,
    });
  }

  if (bundlePromo && bundleCents > 0) {
    snapshots.push({
      label: promoDisplayLabel(bundlePromo),
      badge: item.applied_discounts.find((row) => row.badge)?.badge ?? bundleShortBadge(bundlePromo),
      discount_cents: bundleCents,
      applied: true,
    });
  }

  if (snapshots.length > 0) return snapshots;

  const appliedPromo = item.applied_promotion_id
    ? promotions.find((promotion) => promotion.id === item.applied_promotion_id)
    : undefined;

  if (appliedPromo) {
    return [
      {
        label: promoDisplayLabel(appliedPromo),
        badge: item.applied_discounts[0]?.badge ?? percentShortBadge(appliedPromo),
        discount_cents: Math.max(0, item.line_subtotal_cents - item.line_total_cents),
        applied: true,
      },
    ];
  }

  return [];
}

export function resolveOrderItemDiscounts(
  item: OrderItem,
  context?: {
    product?: Product;
    promotions?: Promotion[];
  },
): AppliedOrderDiscount[] {
  if (context?.product && context.promotions && context.promotions.length > 0) {
    const rebuilt = buildDiscountSnapshots(
      item,
      context.product,
      context.promotions,
    ).filter((discount) => discount.applied && discount.discount_cents > 0);

    if (rebuilt.length > 0) return rebuilt;
  }

  const applied = item.applied_discounts.filter(
    (discount) => discount.applied && discount.discount_cents > 0,
  );
  if (applied.length > 0) return applied;

  const implied = Math.max(0, item.line_subtotal_cents - item.line_total_cents);
  if (implied <= 0) return [];

  return [
    {
      label: 'Descuento',
      badge: item.applied_discounts[0]?.badge ?? null,
      discount_cents: implied,
      applied: true,
    },
  ];
}

export type OrderDiscountRow = {
  key: string;
  label: string;
  badge: string | null;
  discountCents: number;
};

export function collectOrderDiscountRows(
  items: OrderItem[],
  productsById: ReadonlyMap<string, Product>,
  promotions: Promotion[],
): OrderDiscountRow[] {
  const totals = new Map<string, OrderDiscountRow>();

  for (const item of items) {
    const product = item.product_id ? productsById.get(item.product_id) : undefined;
    const discounts = resolveOrderItemDiscounts(item, {
      product,
      promotions,
    });

    for (const discount of discounts) {
      const key = `${discount.label}::${discount.badge ?? ''}`;
      const existing = totals.get(key);
      if (existing) {
        existing.discountCents += discount.discount_cents;
      } else {
        totals.set(key, {
          key,
          label: discount.label,
          badge: discount.badge,
          discountCents: discount.discount_cents,
        });
      }
    }
  }

  return [...totals.values()].sort((a, b) => b.discountCents - a.discountCents);
}

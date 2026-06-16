import type { Promotion } from '@/lib/api/types';
import {
  createPromotion,
  deletePromotion,
  listAllPromotions,
  setPromotionProducts,
  updatePromotion,
} from '@/lib/api/promotions';

/** Marca promociones creadas automáticamente desde el editor de producto. */
export const PRODUCT_CATALOG_DISCOUNT_PREFIX = '__product_discount__';

export function catalogDiscountPromotionName(productName: string): string {
  return `${PRODUCT_CATALOG_DISCOUNT_PREFIX}${productName}`;
}

export function isCatalogProductDiscountPromotion(
  promotion: Promotion,
  productId: string,
): boolean {
  if (promotion.scope !== 'product') return false;
  if (promotion.type !== 'percent' && promotion.type !== 'amount') return false;
  if (!promotion.name.startsWith(PRODUCT_CATALOG_DISCOUNT_PREFIX)) return false;
  return promotion.product_ids.length === 1 && promotion.product_ids[0] === productId;
}

export function discountUsdFromPromotion(promotion: Promotion, priceUsd: number): number {
  if (promotion.type === 'amount' && promotion.amount_cents != null) {
    return promotion.amount_cents / 100;
  }
  if (promotion.type === 'percent' && promotion.percent != null) {
    return Math.round(priceUsd * (promotion.percent / 100) * 100) / 100;
  }
  return 0;
}

export function buildProductCatalogDiscountMapFromPromotions(
  promotions: Promotion[],
  products: { id: string; price_cents: number }[],
): Map<string, number> {
  const priceById = new Map(products.map((p) => [p.id, p.price_cents / 100]));
  const discounts = new Map<string, number>();

  for (const promo of promotions) {
    if (promo.product_ids.length !== 1) continue;
    const productId = promo.product_ids[0]!;
    if (!isCatalogProductDiscountPromotion(promo, productId)) continue;
    const priceUsd = priceById.get(productId) ?? 0;
    discounts.set(productId, discountUsdFromPromotion(promo, priceUsd));
  }

  return discounts;
}

export async function buildProductCatalogDiscountMap(
  token: string,
  restaurantId: string,
  products: { id: string; price_cents: number }[],
  catalogPromotions?: Promotion[],
): Promise<{ discounts: Map<string, number>; promotions: Promotion[] }> {
  const promotions =
    catalogPromotions ?? (await listAllPromotions(token, restaurantId));
  return {
    discounts: buildProductCatalogDiscountMapFromPromotions(promotions, products),
    promotions,
  };
}

function findCatalogPromotionForProductInList(
  promotions: Promotion[],
  productId: string,
): Promotion | null {
  return promotions.find((p) => isCatalogProductDiscountPromotion(p, productId)) ?? null;
}

export type ProductDiscountMode = 'amount' | 'percent';

export async function syncProductCatalogDiscount(
  token: string,
  restaurantId: string,
  productId: string,
  productName: string,
  priceAmount: number,
  discountAmount: number,
  discountMode: ProductDiscountMode,
  discountPercent?: number,
  catalogPromotions?: Promotion[],
): Promise<Promotion[]> {
  let promotions = catalogPromotions ?? (await listAllPromotions(token, restaurantId));
  const existing = findCatalogPromotionForProductInList(promotions, productId);
  const normalizedDiscount = Math.max(0, discountAmount);

  if (normalizedDiscount <= 0) {
    if (existing) {
      await deletePromotion(token, restaurantId, existing.id);
      promotions = promotions.filter((p) => p.id !== existing.id);
    }
    return promotions;
  }

  const name = catalogDiscountPromotionName(productName);

  if (discountMode === 'percent') {
    const percent =
      priceAmount > 0
        ? Math.min(100, Math.max(1, Math.round(Number(discountPercent) || 0)))
        : null;
    if (percent == null) return promotions;

    if (existing) {
      const updated = await updatePromotion(token, restaurantId, existing.id, {
        name,
        type: 'percent',
        scope: 'product',
        percent,
        amount_cents: null,
      });
      if (
        existing.product_ids.length !== 1 ||
        existing.product_ids[0] !== productId
      ) {
        await setPromotionProducts(token, restaurantId, existing.id, [productId]);
      }
      promotions = promotions.map((p) => (p.id === updated.id ? updated : p));
      return promotions;
    }

    const created = await createPromotion(token, restaurantId, {
      name,
      scope: 'product',
      type: 'percent',
      percent,
      amount_cents: null,
      product_ids: [productId],
    });
    return [...promotions, created];
  }

  const amountCents = Math.round(normalizedDiscount * 100);
  if (amountCents <= 0) return promotions;

  if (existing) {
    const updated = await updatePromotion(token, restaurantId, existing.id, {
      name,
      type: 'amount',
      scope: 'product',
      amount_cents: amountCents,
      percent: null,
    });
    if (
      existing.product_ids.length !== 1 ||
      existing.product_ids[0] !== productId
    ) {
      await setPromotionProducts(token, restaurantId, existing.id, [productId]);
    }
    promotions = promotions.map((p) => (p.id === updated.id ? updated : p));
    return promotions;
  }

  const created = await createPromotion(token, restaurantId, {
    name,
    scope: 'product',
    type: 'amount',
    amount_cents: amountCents,
    percent: null,
    product_ids: [productId],
  });
  return [...promotions, created];
}

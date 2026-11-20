export type ProductDetailBackTarget =
  | { kind: 'promotion'; promotionId: string }
  | { kind: 'menu' };

/** Where product detail back should land after leaving a live-menu product. */
export function resolveProductDetailBackTarget(
  returnPromotionId: string | null,
): ProductDetailBackTarget {
  if (returnPromotionId) {
    return { kind: 'promotion', promotionId: returnPromotionId };
  }
  return { kind: 'menu' };
}

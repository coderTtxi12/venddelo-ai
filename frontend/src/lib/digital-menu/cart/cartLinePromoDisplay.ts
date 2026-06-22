import type { Product } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import type { PublicMenuCartLine } from './types';

export type CartLinePromoDisplay = {
  badge: string | null;
  hasCatalogDiscount: boolean;
  originalLineTotalCents: number | null;
};

export function resolveCartLinePromoDisplay(
  line: PublicMenuCartLine,
  product: Product | undefined,
  discount: MenuProductDiscountInfo | null | undefined,
): CartLinePromoDisplay {
  if (!discount) {
    return {
      badge: null,
      hasCatalogDiscount: false,
      originalLineTotalCents: null,
    };
  }

  const hasCatalogDiscount = discount.amountOff > 0;
  let badge = discount.badge;

  if (!badge && hasCatalogDiscount && product) {
    badge = `-${formatMoney(discount.amountOff, product.currency)}`;
  }

  const originalLineTotalCents =
    hasCatalogDiscount && product
      ? (product.price_cents + line.optionsTotalCents) * line.quantity
      : null;

  return {
    badge,
    hasCatalogDiscount,
    originalLineTotalCents,
  };
}

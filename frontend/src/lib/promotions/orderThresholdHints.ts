import type { CartQuote } from '@/lib/api/public';
import type { Promotion } from '@/lib/api/types';
import type { RestaurantServiceType } from '@/lib/restaurantServices';
import { formatMoney } from '@/lib/currency';
import { isPromotionEffective } from './effective';
import { promotionDisplayName } from './display';

export type OrderThresholdHint = {
  promotionId: string;
  label: string;
  message: string;
};

export function quoteEligibleSubtotalCents(quote: CartQuote): number {
  return quote.lines.reduce((sum, line) => sum + line.line_total_cents, 0);
}

function thresholdHintMessage(promotion: Promotion, remainingCents: number): string {
  const remaining = formatMoney(remainingCents / 100);
  if (promotion.type === 'free_shipping') {
    return `Agrega ${remaining} más para envío gratis`;
  }
  if (promotion.type === 'percent' && promotion.percent != null) {
    return `Agrega ${remaining} más y obtén ${promotion.percent}% de descuento en tu pedido`;
  }
  if (promotion.type === 'amount' && promotion.amount_cents != null) {
    return `Agrega ${remaining} más y obtén ${formatMoney(promotion.amount_cents / 100)} de descuento`;
  }
  return `Agrega ${remaining} más para activar esta promoción`;
}

export function listUnmetOrderThresholdHints(
  promotions: Promotion[],
  subtotalCents: number,
  now: Date,
  timezone: string,
  options: {
    serviceType?: RestaurantServiceType;
    appliedOrderPromotionId?: string | null;
    appliedFreeShippingPromotionId?: string | null;
  } = {},
): OrderThresholdHint[] {
  const hints: Array<OrderThresholdHint & { remainingCents: number }> = [];

  for (const promotion of promotions) {
    if (promotion.scope !== 'order') continue;
    if (!promotion.min_order_cents || promotion.min_order_cents <= subtotalCents) continue;
    if (!isPromotionEffective(promotion, now, timezone)) continue;
    if (promotion.type === 'free_shipping' && options.serviceType !== 'delivery') continue;
    if (promotion.id === options.appliedOrderPromotionId) continue;
    if (promotion.id === options.appliedFreeShippingPromotionId) continue;

    const remainingCents = promotion.min_order_cents - subtotalCents;
    hints.push({
      promotionId: promotion.id,
      label: promotionDisplayName(promotion),
      message: thresholdHintMessage(promotion, remainingCents),
      remainingCents,
    });
  }

  return hints
    .sort((left, right) => left.remainingCents - right.remainingCents)
    .slice(0, 2)
    .map(({ promotionId, label, message }) => ({ promotionId, label, message }));
}

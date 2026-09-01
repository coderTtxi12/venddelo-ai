import type { OptionSelections } from '@/components/digital-menu/productOptionSelection';
import type { CartQuoteInput } from '@/lib/api/public';
import type { PublicMenuCartLine } from './types';

export type CartQuoteContext = {
  couponCode?: string | null;
  serviceType?: 'takeout' | 'delivery' | null;
  deliveryFeeCents?: number;
};

export function selectionsToQuoteApi(selections: OptionSelections): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [groupId, itemIds] of Object.entries(selections)) {
    if (itemIds.length > 0) {
      out[groupId] = itemIds;
    }
  }
  return out;
}

function normalizeCouponCode(raw: string | null | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.toUpperCase();
}

export function cartLinesToQuoteInput(
  lines: PublicMenuCartLine[],
  context?: CartQuoteContext,
): CartQuoteInput {
  const payload: CartQuoteInput = {
    items: lines.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
      selected_options: selectionsToQuoteApi(line.selections),
    })),
  };

  const couponCode = normalizeCouponCode(context?.couponCode);
  if (couponCode) payload.coupon_code = couponCode;
  if (context?.serviceType) payload.service_type = context.serviceType;
  if (context?.deliveryFeeCents != null && context.deliveryFeeCents > 0) {
    payload.delivery_fee_cents = context.deliveryFeeCents;
  }

  return payload;
}

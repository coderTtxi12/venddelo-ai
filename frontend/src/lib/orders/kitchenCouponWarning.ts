import { formatMoney } from '@/lib/currency';

export type KitchenCouponOrder = {
  status: string;
  applied_coupon_id?: string | null;
  applied_coupon_code?: string | null;
};

export function formatKitchenCouponBanner(code: string): string {
  return `Cupón ${code} sin existencias. Puedes confirmar igual.`;
}

export function formatKitchenCouponDialogLine(code: string): string {
  return `• Cupón ${code} — sin existencias restantes`;
}

export function joinKitchenWarningBanners(parts: string[]): string {
  return parts.filter(Boolean).join(' ');
}

export function orderHasCouponStockWarning(
  order: KitchenCouponOrder,
  remainingQty: number | null | undefined,
  stockQty: number | null | undefined,
): boolean {
  if (order.status !== 'pending' || !order.applied_coupon_id) return false;
  if (stockQty == null) return false;
  return (remainingQty ?? 0) <= 0;
}

export function couponRemainingQty(
  stockQty: number | null | undefined,
  redeemedCount: number | null | undefined,
): number | null {
  if (stockQty == null) return null;
  return stockQty - (redeemedCount ?? 0);
}

export function formatKitchenCouponChip(order: {
  applied_coupon_code?: string | null;
  coupon_discount_cents?: number;
  coupon_waived_delivery_cents?: number;
}): string | null {
  if (!order.applied_coupon_code) return null;
  const code = order.applied_coupon_code;
  if ((order.coupon_waived_delivery_cents ?? 0) > 0) {
    return `Cupón ${code} · Envío gratis`;
  }
  if ((order.coupon_discount_cents ?? 0) > 0) {
    return `Cupón ${code} · −${formatMoney((order.coupon_discount_cents ?? 0) / 100)}`;
  }
  return `Cupón ${code}`;
}

import type { CouponApplication } from '@/lib/api/types';

/** El cupón cuenta como aplicado cuando el restaurante aceptó el pedido en cocina. */
export function isConfirmedCouponApplication(application: CouponApplication): boolean {
  return application.redeemed;
}

export function summarizeConfirmedCouponApplications(applications: CouponApplication[]): {
  uses: number;
  totalDiscountCents: number;
} {
  const confirmed = applications.filter(isConfirmedCouponApplication);
  return {
    uses: confirmed.length,
    totalDiscountCents: confirmed.reduce((sum, item) => sum + item.coupon_discount_cents, 0),
  };
}

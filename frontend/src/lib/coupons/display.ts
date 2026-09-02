import { formatMoney } from '@/lib/currency';
import type { Coupon, CouponEffectiveStatus, CouponType } from '@/lib/api/types';

export function couponTypeLabel(type: CouponType): string {
  if (type === 'percent') return 'Porcentaje';
  if (type === 'amount') return 'Monto fijo';
  return 'Envío gratis';
}

export function couponScopeLabel(scope: Coupon['scope']): string {
  if (scope === 'product') return 'Producto(s)';
  if (scope === 'category') return 'Categoría(s)';
  return 'Todo el pedido';
}

export function couponBenefitLabel(coupon: Pick<Coupon, 'type' | 'percent' | 'amount_cents'>): string {
  if (coupon.type === 'percent' && coupon.percent != null) return `${coupon.percent}%`;
  if (coupon.type === 'amount' && coupon.amount_cents != null) {
    return formatMoney(coupon.amount_cents / 100);
  }
  if (coupon.type === 'free_shipping') return 'Envío gratis';
  return '—';
}

export function couponStockLabel(redeemedCount: number, stockQty: number | null): string {
  if (stockQty == null) return 'Ilimitado';
  return `${redeemedCount} / ${stockQty}`;
}

export function couponStatusLabel(status: CouponEffectiveStatus): string {
  if (status === 'active') return 'Activo';
  if (status === 'inactive') return 'Inactivo';
  if (status === 'scheduled') return 'Programado';
  if (status === 'expired') return 'Expirado';
  return 'Agotado';
}

export function formatCouponExpiry(expiresOn: string | null): string {
  if (!expiresOn) return 'Sin caducidad';
  return new Date(`${expiresOn}T12:00:00`).toLocaleDateString('es-MX', { dateStyle: 'medium' });
}

export { formatCouponValidityRange } from './dates';

export { formatCouponWeekdaysLabel, formatCouponWeekdaysSummary } from './weekdays';

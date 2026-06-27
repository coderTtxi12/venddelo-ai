import { formatMoney } from '@/lib/currency';
import type { CheckoutFulfillment } from './fulfillment';

/** Common MXN bill denominations in centavos. */
export const MXN_BILL_DENOMINATIONS_CENTS = [
  2000, 5000, 10000, 20000, 50000, 100000,
] as const;

export function needsCashDenomination(fulfillment: CheckoutFulfillment): boolean {
  return fulfillment.serviceType === 'delivery' && fulfillment.paymentMethod === 'cash';
}

export function isCashDenominationValid(
  cents: number | null | undefined,
  orderTotalCents: number,
): boolean {
  if (cents == null || !Number.isInteger(cents) || cents <= 0) return false;
  return cents >= orderTotalCents;
}

export function suggestedCashDenominations(orderTotalCents: number): number[] {
  return MXN_BILL_DENOMINATIONS_CENTS.filter((bill) => bill >= orderTotalCents);
}

export function formatCashDenominationLabel(cents: number): string {
  return formatMoney(cents / 100, 'MXN');
}

export function parseCashDenominationInput(value: string): number | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  const pesos = Number.parseInt(digits, 10);
  if (!Number.isFinite(pesos) || pesos <= 0) return null;
  return pesos * 100;
}

export function cashDenominationChangeCents(
  denominationCents: number,
  orderTotalCents: number,
): number {
  return Math.max(0, denominationCents - orderTotalCents);
}

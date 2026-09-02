import { ApiError } from '@/lib/api/types';

export type CouponFieldKey =
  | 'code'
  | 'name'
  | 'percent'
  | 'amount'
  | 'scope'
  | 'stockQty'
  | 'startsOn'
  | 'expiresOn'
  | 'weekdays';

export const COUPON_FIELD_ORDER: CouponFieldKey[] = [
  'code',
  'name',
  'percent',
  'amount',
  'scope',
  'stockQty',
  'startsOn',
  'expiresOn',
  'weekdays',
];

export type CouponFieldErrors = Partial<Record<CouponFieldKey, string>>;

export function couponFieldErrorMessages(errors: CouponFieldErrors): string[] {
  return COUPON_FIELD_ORDER.map((key) => errors[key]).filter((message): message is string =>
    Boolean(message),
  );
}

export function firstCouponFieldError(errors: CouponFieldErrors): CouponFieldKey | null {
  return COUPON_FIELD_ORDER.find((key) => Boolean(errors[key])) ?? null;
}

export function isCouponCodeConflictMessage(message: string): boolean {
  return /cup[oó]n con ese c[oó]digo|coupon code already exists/i.test(message);
}

export function isCouponCodeConflictError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.code !== 'conflict') return false;
  return isCouponCodeConflictMessage(error.message);
}

export function formatCouponSaveError(error: unknown, mode: 'create' | 'edit'): string {
  if (error instanceof ApiError) {
    if (isCouponCodeConflictError(error)) {
      return 'Ya existe un cupón con ese código en tu restaurante. Elige otro código o edita el cupón que ya lo tiene.';
    }
    if (error.message.trim()) {
      return error.message;
    }
  }
  return mode === 'edit'
    ? 'No se pudieron guardar los cambios. Revisa los datos e intenta de nuevo.'
    : 'No se pudo crear el cupón. Revisa los datos e intenta de nuevo.';
}

export function scrollToCouponField(
  form: HTMLElement | null,
  field: CouponFieldKey,
): void {
  const target = form?.querySelector<HTMLElement>(`[data-coupon-field="${field}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const focusable = target.querySelector<HTMLElement>(
    'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])',
  );
  focusable?.focus({ preventScroll: true });
}

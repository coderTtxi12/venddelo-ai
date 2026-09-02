/** Strip all whitespace and uppercase for coupon code input/API payloads. */
export function formatCouponCodeInput(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function normalizeCouponCodeForApi(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const code = formatCouponCodeInput(raw);
  return code || undefined;
}

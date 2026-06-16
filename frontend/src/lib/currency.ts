export const DEFAULT_CURRENCY = 'MXN';

export function formatMoney(amount: number, currency: string = DEFAULT_CURRENCY): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const locale =
    currency === 'MXN' ? 'es-MX' : currency === 'USD' ? 'en-US' : undefined;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

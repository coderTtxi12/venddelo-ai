import {
  DEFAULT_COUNTRY_ISO,
  findCountryByIso,
  formatE164,
} from '@/lib/phone/countryDialCodes';
import { parseE164Phone } from '@/lib/phone/parseE164';
import type { CheckoutFulfillment } from './fulfillment';

export const MIN_CUSTOMER_PHONE_LOCAL_DIGITS = 8;

export function isCustomerPhoneLocalValid(localNumber: string): boolean {
  return localNumber.replace(/\D/g, '').length >= MIN_CUSTOMER_PHONE_LOCAL_DIGITS;
}

export function buildCheckoutCustomerPhoneE164(fulfillment: CheckoutFulfillment): string {
  const country = findCountryByIso(fulfillment.customerPhoneCountryIso);
  return formatE164(country.dialCode, fulfillment.customerPhoneLocal);
}

/** Legacy placeholder stored before customers entered their WhatsApp at checkout. */
export function isLegacyWhatsAppPendingPhone(phone: string): boolean {
  return phone === 'whatsapp';
}

export function formatOrderCustomerPhone(phone: string): string {
  if (isLegacyWhatsAppPendingPhone(phone)) return 'Vía WhatsApp';

  const trimmed = phone.trim();
  if (!trimmed) return '—';

  const normalized = trimmed.startsWith('+')
    ? trimmed
    : `+${trimmed.replace(/\D/g, '')}`;
  const parsed = parseE164Phone(normalized);
  const country = findCountryByIso(parsed.countryIso);
  return `${country.dialCode} ${parsed.localNumber}`;
}

export const DEFAULT_CHECKOUT_PHONE_COUNTRY_ISO = DEFAULT_COUNTRY_ISO;

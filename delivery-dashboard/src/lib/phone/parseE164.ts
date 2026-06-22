import { COUNTRY_DIAL_CODES, DEFAULT_COUNTRY_ISO } from './countryDialCodes';

export function parseE164Phone(e164: string | null | undefined): {
  countryIso: string;
  localNumber: string;
} {
  const digits = (e164 ?? '').replace(/\D/g, '');
  if (!digits) {
    return { countryIso: DEFAULT_COUNTRY_ISO, localNumber: '' };
  }

  const byDialLength = [...COUNTRY_DIAL_CODES].sort(
    (a, b) => b.dialCode.replace(/\D/g, '').length - a.dialCode.replace(/\D/g, '').length,
  );

  for (const country of byDialLength) {
    const code = country.dialCode.replace(/\D/g, '');
    if (digits.startsWith(code)) {
      return { countryIso: country.iso, localNumber: digits.slice(code.length) };
    }
  }

  return { countryIso: DEFAULT_COUNTRY_ISO, localNumber: digits };
}

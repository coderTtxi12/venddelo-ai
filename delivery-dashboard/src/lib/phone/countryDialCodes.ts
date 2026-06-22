export type CountryDialCode = {
  iso: string;
  name: string;
  dialCode: string;
  flag: string;
};

/** México primero (default); lista ampliada para LATAM y destinos frecuentes. */
export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { iso: 'MX', name: 'México', dialCode: '+52', flag: '🇲🇽' },
  { iso: 'US', name: 'Estados Unidos', dialCode: '+1', flag: '🇺🇸' },
  { iso: 'CA', name: 'Canadá', dialCode: '+1', flag: '🇨🇦' },
  { iso: 'GT', name: 'Guatemala', dialCode: '+502', flag: '🇬🇹' },
  { iso: 'BZ', name: 'Belice', dialCode: '+501', flag: '🇧🇿' },
  { iso: 'SV', name: 'El Salvador', dialCode: '+503', flag: '🇸🇻' },
  { iso: 'HN', name: 'Honduras', dialCode: '+504', flag: '🇭🇳' },
  { iso: 'NI', name: 'Nicaragua', dialCode: '+505', flag: '🇳🇮' },
  { iso: 'CR', name: 'Costa Rica', dialCode: '+506', flag: '🇨🇷' },
  { iso: 'PA', name: 'Panamá', dialCode: '+507', flag: '🇵🇦' },
  { iso: 'CU', name: 'Cuba', dialCode: '+53', flag: '🇨🇺' },
  { iso: 'DO', name: 'República Dominicana', dialCode: '+1', flag: '🇩🇴' },
  { iso: 'PR', name: 'Puerto Rico', dialCode: '+1', flag: '🇵🇷' },
  { iso: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { iso: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
  { iso: 'EC', name: 'Ecuador', dialCode: '+593', flag: '🇪🇨' },
  { iso: 'PE', name: 'Perú', dialCode: '+51', flag: '🇵🇪' },
  { iso: 'BO', name: 'Bolivia', dialCode: '+591', flag: '🇧🇴' },
  { iso: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { iso: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
  { iso: 'UY', name: 'Uruguay', dialCode: '+598', flag: '🇺🇾' },
  { iso: 'PY', name: 'Paraguay', dialCode: '+595', flag: '🇵🇾' },
  { iso: 'BR', name: 'Brasil', dialCode: '+55', flag: '🇧🇷' },
  { iso: 'ES', name: 'España', dialCode: '+34', flag: '🇪🇸' },
  { iso: 'PT', name: 'Portugal', dialCode: '+351', flag: '🇵🇹' },
  { iso: 'FR', name: 'Francia', dialCode: '+33', flag: '🇫🇷' },
  { iso: 'DE', name: 'Alemania', dialCode: '+49', flag: '🇩🇪' },
  { iso: 'IT', name: 'Italia', dialCode: '+39', flag: '🇮🇹' },
  { iso: 'GB', name: 'Reino Unido', dialCode: '+44', flag: '🇬🇧' },
];

export const DEFAULT_COUNTRY_ISO = 'MX';

export function findCountryByIso(iso: string): CountryDialCode {
  return COUNTRY_DIAL_CODES.find((c) => c.iso === iso) ?? COUNTRY_DIAL_CODES[0]!;
}

export function formatE164(dialCode: string, localNumber: string): string {
  const digits = localNumber.replace(/\D/g, '');
  const codeDigits = dialCode.replace(/\D/g, '');
  return `+${codeDigits}${digits}`;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

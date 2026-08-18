/** Strip non-digits for tel: and wa.me links. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

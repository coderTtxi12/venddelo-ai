export const MEXY_ON_HOLD_TITLE = 'Mexy pausó las entregas de tu negocio';
export const MEXY_ON_HOLD_DETAIL =
  'Escríbenos por WhatsApp para reactivarlas. Los envíos que ya están en camino siguen.';
export const MEXY_ON_HOLD_WHATSAPP_DISPLAY = '55 7427 7066';

export function mexyOnHoldWhatsAppUrl(): string {
  return 'https://wa.me/525574277066';
}

export function isMexyPartnershipOnHold(
  service: { on_hold?: boolean } | null | undefined,
): boolean {
  return service?.on_hold === true;
}

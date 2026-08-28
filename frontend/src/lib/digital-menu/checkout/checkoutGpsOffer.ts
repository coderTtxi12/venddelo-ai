export type CheckoutGpsOfferKind = 'card' | 'button' | 'none';

export type CheckoutGpsOfferInput = {
  geolocationAvailable: boolean;
  mapsApiAvailable: boolean;
  hasCoordinates: boolean;
  offerDismissed: boolean;
};

export const CHECKOUT_GPS_COPY = {
  cardTitle: '¿Usar tu ubicación?',
  cardBody:
    'Llenamos tu domicilio automáticamente. Es opcional; después puedes ajustar el pin.',
  allow: 'Permitir ubicación',
  writeInstead: 'Prefiero escribirla',
  useLocation: 'Usar mi ubicación',
  requesting: 'Obteniendo tu ubicación…',
  denied: 'No se usó la ubicación. Busca tu domicilio abajo.',
  servicesOff:
    'Activa la ubicación en tu teléfono y vuelve a tocar Usar mi ubicación. Después te pediremos permiso.',
  unavailable:
    'Activa la ubicación en tu teléfono e inténtalo de nuevo. Si no aparece el aviso, enciéndela en Ajustes.',
} as const;

export function resolveCheckoutGpsOffer(input: CheckoutGpsOfferInput): CheckoutGpsOfferKind {
  if (!input.geolocationAvailable || !input.mapsApiAvailable) return 'none';
  if (input.hasCoordinates || input.offerDismissed) return 'button';
  return 'card';
}

export function checkoutGpsErrorMessage(
  reason: 'denied' | 'unavailable' | 'unsupported' | 'services_off',
): string | null {
  if (reason === 'denied') return CHECKOUT_GPS_COPY.denied;
  if (reason === 'services_off') return CHECKOUT_GPS_COPY.servicesOff;
  if (reason === 'unavailable') return CHECKOUT_GPS_COPY.unavailable;
  return null;
}

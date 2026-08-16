import type { DeliveryProviderZone, DeliveryProviderZoneWrite } from '@/lib/api/types';
import type { OnboardingData } from '@/lib/onboarding/types';

export type ZoneFormState = Pick<
  OnboardingData,
  | 'serviceZoneName'
  | 'serviceZonePolygon'
  | 'serviceZoneSearchAddress'
  | 'serviceZoneCenterLat'
  | 'serviceZoneCenterLng'
>;

export function createEmptyZoneForm(name = ''): ZoneFormState {
  return {
    serviceZoneName: name,
    serviceZonePolygon: null,
    serviceZoneSearchAddress: '',
    serviceZoneCenterLat: null,
    serviceZoneCenterLng: null,
  };
}

export function zoneFormFromApi(zone: DeliveryProviderZone): ZoneFormState {
  return {
    serviceZoneName: zone.name,
    serviceZonePolygon: zone.polygon,
    serviceZoneSearchAddress: '',
    serviceZoneCenterLat: zone.center_lat,
    serviceZoneCenterLng: zone.center_lng,
  };
}

export function zoneFieldsDirty(current: ZoneFormState, initial: ZoneFormState): boolean {
  return (
    current.serviceZoneName !== initial.serviceZoneName ||
    JSON.stringify(current.serviceZonePolygon) !== JSON.stringify(initial.serviceZonePolygon) ||
    current.serviceZoneCenterLat !== initial.serviceZoneCenterLat ||
    current.serviceZoneCenterLng !== initial.serviceZoneCenterLng
  );
}

export function buildZoneWritePayload(form: ZoneFormState): DeliveryProviderZoneWrite {
  return {
    name: form.serviceZoneName.trim(),
    polygon: form.serviceZonePolygon!,
    center_lat: form.serviceZoneCenterLat,
    center_lng: form.serviceZoneCenterLng,
  };
}

export function zoneDeleteBlockedMessage(restaurantCount: number): string {
  if (restaurantCount === 1) {
    return 'Reasigna 1 negocio antes de eliminar esta zona';
  }
  return `Reasigna ${restaurantCount} negocios antes de eliminar esta zona`;
}

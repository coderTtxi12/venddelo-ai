import type { DeliveryProviderMeResponse } from '@/lib/api/types';
import { parseE164Phone } from '@/lib/phone/parseE164';
import { buildPhoneE164 } from '@/lib/onboarding/validation';
import type { GeoJsonPolygon, OnboardingData } from '@/lib/onboarding/types';
import { storagePublicUrl } from '@/lib/storage/publicUrl';

export type ProviderProfileForm = OnboardingData;

export function providerProfileFromApi(response: DeliveryProviderMeResponse): ProviderProfileForm | null {
  const provider = response.provider;
  if (!provider) return null;

  const responsible = parseE164Phone(provider.responsible_phone);
  const whatsapp = parseE164Phone(provider.whatsapp_phone);
  const zone = response.primary_zone;

  return {
    companyName: provider.name,
    responsibleName: provider.responsible_name ?? '',
    responsiblePhoneCountryIso: responsible.countryIso,
    responsiblePhoneLocal: responsible.localNumber,
    whatsappCountryIso: whatsapp.countryIso,
    whatsappLocal: whatsapp.localNumber,
    whatsappSameAsResponsible:
      provider.responsible_phone != null &&
      provider.whatsapp_phone != null &&
      provider.responsible_phone === provider.whatsapp_phone,
    serviceZoneName: zone?.name ?? 'Cobertura principal',
    serviceZonePolygon: zone?.polygon ?? null,
    serviceZoneSearchAddress: '',
    serviceZoneCenterLat: zone?.center_lat ?? null,
    serviceZoneCenterLng: zone?.center_lng ?? null,
    logoDataUrl: storagePublicUrl(provider.logo_path),
    logoFileName: provider.logo_path ? 'logo.webp' : null,
  };
}

export function validateProviderProfileCore(data: ProviderProfileForm): string | null {
  if (data.companyName.trim().length < 2) {
    return 'Ingresa el nombre de tu empresa de delivery.';
  }
  if (data.responsibleName.trim().length < 2) {
    return 'Ingresa el nombre del responsable.';
  }
  const responsiblePhone = buildPhoneE164(
    data.responsiblePhoneCountryIso,
    data.responsiblePhoneLocal,
  );
  if (responsiblePhone.length < 10) {
    return 'Ingresa un número de celular válido del responsable.';
  }
  const whatsappPhone = buildPhoneE164(data.whatsappCountryIso, data.whatsappLocal);
  if (whatsappPhone.length < 10) {
    return 'Ingresa un WhatsApp válido de la empresa.';
  }
  if (!data.logoDataUrl) {
    return 'Sube el logo de tu empresa.';
  }
  return null;
}

export function validateServiceZone(
  data: Pick<ProviderProfileForm, 'serviceZonePolygon'>,
): string | null {
  const ring = data.serviceZonePolygon?.coordinates?.[0] ?? [];
  if (ring.length < 4) {
    return 'Dibuja el cerco de servicio en el mapa (mínimo 3 puntos).';
  }
  return null;
}

export function validateProviderProfile(data: ProviderProfileForm): string | null {
  const coreError = validateProviderProfileCore(data);
  if (coreError) return coreError;
  return validateServiceZone(data);
}

export function buildProfileUpdatePayload(data: ProviderProfileForm) {
  const logoIsNewUpload = data.logoDataUrl?.startsWith('data:') ?? false;

  return {
    company_name: data.companyName.trim(),
    responsible_name: data.responsibleName.trim(),
    responsible_phone: buildPhoneE164(data.responsiblePhoneCountryIso, data.responsiblePhoneLocal),
    whatsapp_phone: buildPhoneE164(data.whatsappCountryIso, data.whatsappLocal),
    service_zone_name: data.serviceZoneName.trim() || 'Cobertura principal',
    service_zone_polygon: data.serviceZonePolygon as GeoJsonPolygon,
    center_lat: data.serviceZoneCenterLat,
    center_lng: data.serviceZoneCenterLng,
    logo_base64: logoIsNewUpload ? data.logoDataUrl : null,
    logo_file_name: logoIsNewUpload ? data.logoFileName : null,
  };
}

import { findCountryByIso } from '@/lib/phone/countryDialCodes';
import type { OnboardingData, OnboardingStepId } from './types';

export function buildPhoneE164(countryIso: string, localNumber: string): string {
  const country = findCountryByIso(countryIso);
  const digits = localNumber.replace(/\D/g, '');
  if (!digits) return '';
  return `${country.dialCode}${digits}`;
}

export function validateStep(stepId: OnboardingStepId, data: OnboardingData): string | null {
  switch (stepId) {
    case 'companyName':
      if (data.companyName.trim().length < 2) {
        return 'Ingresa el nombre de tu empresa de delivery.';
      }
      return null;

    case 'responsibleName':
      if (data.responsibleName.trim().length < 2) {
        return 'Ingresa el nombre del responsable.';
      }
      return null;

    case 'responsiblePhone': {
      const phone = buildPhoneE164(data.responsiblePhoneCountryIso, data.responsiblePhoneLocal);
      if (phone.length < 10) {
        return 'Ingresa un número de celular válido del responsable.';
      }
      return null;
    }

    case 'whatsapp': {
      const phone = buildPhoneE164(data.whatsappCountryIso, data.whatsappLocal);
      if (phone.length < 10) {
        return 'Ingresa un WhatsApp válido de la empresa.';
      }
      return null;
    }

    case 'serviceZone': {
      const ring = data.serviceZonePolygon?.coordinates?.[0] ?? [];
      if (ring.length < 4) {
        return 'Dibuja el cerco de servicio en el mapa (mínimo 3 puntos).';
      }
      return null;
    }

    case 'logo':
      if (!data.logoDataUrl) {
        return 'Sube el logo de tu empresa.';
      }
      return null;

    default:
      return null;
  }
}

export function buildOnboardingPayload(data: OnboardingData) {
  return {
    company_name: data.companyName.trim(),
    responsible_name: data.responsibleName.trim(),
    responsible_phone: buildPhoneE164(data.responsiblePhoneCountryIso, data.responsiblePhoneLocal),
    whatsapp_phone: buildPhoneE164(data.whatsappCountryIso, data.whatsappLocal),
    service_zone_name: data.serviceZoneName.trim() || 'Cobertura principal',
    service_zone_polygon: data.serviceZonePolygon,
    logo_base64: data.logoDataUrl,
    logo_file_name: data.logoFileName,
  };
}

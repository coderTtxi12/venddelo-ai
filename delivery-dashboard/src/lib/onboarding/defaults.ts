import type { OnboardingData } from './types';

export function createDefaultOnboardingData(): OnboardingData {
  return {
    companyName: '',
    responsibleName: '',
    responsiblePhoneCountryIso: 'MX',
    responsiblePhoneLocal: '',
    whatsappCountryIso: 'MX',
    whatsappLocal: '',
    whatsappSameAsResponsible: false,
    serviceZoneName: 'Cobertura principal',
    serviceZonePolygon: null,
    serviceZoneSearchAddress: '',
    serviceZoneCenterLat: null,
    serviceZoneCenterLng: null,
    logoDataUrl: null,
    logoFileName: null,
  };
}

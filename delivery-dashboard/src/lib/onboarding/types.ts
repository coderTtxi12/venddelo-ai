export type OnboardingStepId =
  | 'companyName'
  | 'responsibleName'
  | 'responsiblePhone'
  | 'whatsapp'
  | 'serviceZone'
  | 'logo';

export type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

export type OnboardingData = {
  companyName: string;
  responsibleName: string;
  responsiblePhoneCountryIso: string;
  responsiblePhoneLocal: string;
  whatsappCountryIso: string;
  whatsappLocal: string;
  whatsappSameAsResponsible: boolean;
  serviceZoneName: string;
  serviceZonePolygon: GeoJsonPolygon | null;
  serviceZoneSearchAddress: string;
  serviceZoneCenterLat: number | null;
  serviceZoneCenterLng: number | null;
  logoDataUrl: string | null;
  logoFileName: string | null;
};

export type OnboardingProgress = {
  currentStepId: OnboardingStepId;
  updatedAt: string;
};

export type PersistedOnboardingState = {
  version: 1;
  userId: string;
  data: OnboardingData;
  progress: OnboardingProgress;
};

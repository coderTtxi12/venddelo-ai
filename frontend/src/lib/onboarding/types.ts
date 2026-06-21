import type { PaymentMethodMatrix } from '@/lib/restaurantPaymentConfig';
import type { ServiceScheduleDraft } from '@/lib/restaurantScheduleHours';

export type OnboardingStepId =
  | 'businessName'
  | 'description'
  | 'ownerName'
  | 'ownerPhone'
  | 'branchCount'
  | 'logo'
  | 'cover'
  | 'location'
  | 'schedule'
  | 'orderTypes'
  | 'paymentMethods'
  | 'whatsapp';

export type OnboardingLocation = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
};

export type OnboardingData = {
  businessName: string;
  businessDescription: string;
  ownerName: string;
  ownerPhoneCountryIso: string;
  ownerPhoneLocal: string;
  branchCount: number;
  logoDataUrl: string | null;
  logoFileName: string | null;
  coverDataUrl: string | null;
  coverFileName: string | null;
  location: OnboardingLocation;
  scheduleDrafts: ServiceScheduleDraft[];
  deliveryEnabled: boolean;
  takeoutEnabled: boolean;
  paymentMatrix: PaymentMethodMatrix;
  whatsappCountryIso: string;
  whatsappLocal: string;
  whatsappSameAsOwner: boolean;
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

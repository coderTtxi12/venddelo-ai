import { createDefaultPaymentMatrix } from '@/lib/restaurantPaymentConfig';
import type { ServiceScheduleDraft } from '@/lib/restaurantScheduleHours';
import { DEFAULT_COUNTRY_ISO } from '@/lib/phone/countryDialCodes';
import {
  createDefaultOnboardingSchedule,
  normalizeOnboardingScheduleDrafts,
} from './schedule';
import type { OnboardingData } from './types';

export { createDefaultOnboardingSchedule, createOnboardingDefaultSlot } from './schedule';

export function createDefaultOnboardingData(): OnboardingData {
  return {
    businessName: '',
    ownerName: '',
    ownerPhoneCountryIso: DEFAULT_COUNTRY_ISO,
    ownerPhoneLocal: '',
    branchCount: 1,
    logoDataUrl: null,
    logoFileName: null,
    coverDataUrl: null,
    coverFileName: null,
    location: {
      address: '',
      latitude: null,
      longitude: null,
      placeId: null,
    },
    scheduleDrafts: createDefaultOnboardingSchedule(),
    deliveryEnabled: true,
    takeoutEnabled: true,
    paymentMatrix: createDefaultPaymentMatrix(),
    whatsappCountryIso: DEFAULT_COUNTRY_ISO,
    whatsappLocal: '',
    whatsappSameAsOwner: false,
  };
}

/** Rehidrata borradores de horario desde localStorage (sin schedules de API). */
export function hydrateScheduleDrafts(raw: unknown): ServiceScheduleDraft[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return createDefaultOnboardingSchedule();
  }
  return normalizeOnboardingScheduleDrafts(raw as ServiceScheduleDraft[]);
}

/** Si no hay horarios guardados, usa el default 9:00–23:00 todos los días. */
export function ensureScheduleDefaults(drafts: ServiceScheduleDraft[]): ServiceScheduleDraft[] {
  return normalizeOnboardingScheduleDrafts(drafts);
}

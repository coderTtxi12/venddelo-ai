import type { RestaurantScheduleCreateInput } from '@/lib/api/types';
import {
  scheduleDraftsToCreatePayload,
  type ServiceScheduleDraft,
  WEEKDAY_LABELS,
} from '@/lib/restaurantScheduleHours';
const ONBOARDING_DEFAULT_SLOT = { opensAt: '09:00', closesAt: '23:00' };

export const ONBOARDING_SCHEDULE_LABEL = 'Horario de tu negocio';

export function createOnboardingDefaultSlot() {
  return { ...ONBOARDING_DEFAULT_SLOT };
}

export function createDefaultOnboardingSchedule(): ServiceScheduleDraft[] {
  const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

  return [
    {
      serviceType: 'takeout',
      label: ONBOARDING_SCHEDULE_LABEL,
      days: WEEKDAY_LABELS.map((label, dayIndex) => ({
        dayIndex,
        label,
        isToday: dayIndex === todayIndex,
        isClosed: false,
        slots: [{ ...ONBOARDING_DEFAULT_SLOT }],
      })),
    },
  ];
}

/** Unifica borradores antiguos (takeout + delivery) a un solo horario de negocio. */
export function normalizeOnboardingScheduleDrafts(
  drafts: ServiceScheduleDraft[],
): ServiceScheduleDraft[] {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return createDefaultOnboardingSchedule();
  }

  const takeout = drafts.find((draft) => draft.serviceType === 'takeout');
  const delivery = drafts.find((draft) => draft.serviceType === 'delivery');
  const source = takeout ?? delivery ?? drafts[0]!;

  return [
    {
      serviceType: 'takeout',
      label: ONBOARDING_SCHEDULE_LABEL,
      days: source.days.map((day) => ({
        ...day,
        slots: day.slots.length > 0 ? day.slots : [createOnboardingDefaultSlot()],
      })),
    },
  ];
}

export function buildOnboardingSchedulePayload(
  drafts: ServiceScheduleDraft[],
  options: { takeoutEnabled: boolean; deliveryEnabled: boolean },
): RestaurantScheduleCreateInput[] {
  const normalized = normalizeOnboardingScheduleDrafts(drafts);
  const baseEntries = scheduleDraftsToCreatePayload(normalized);
  const payload: RestaurantScheduleCreateInput[] = [];

  if (options.takeoutEnabled) {
    payload.push(...baseEntries.map((entry) => ({ ...entry, service_type: 'takeout' as const })));
  }
  if (options.deliveryEnabled) {
    payload.push(...baseEntries.map((entry) => ({ ...entry, service_type: 'delivery' as const })));
  }

  return payload;
}

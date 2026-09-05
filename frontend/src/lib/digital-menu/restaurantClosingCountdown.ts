import type { RestaurantSchedule } from '@/lib/api/types';
import type { RestaurantServiceType } from '@/lib/restaurantServices';
import {
  formatCountdownDuration,
  getRestaurantClosingDeadlineWhileOpen,
  type PromotionCountdownContext,
} from '@/lib/promotions/promotionCountdown';

export const RESTAURANT_CLOSING_COUNTDOWN_LABEL = 'Cierra en';

export type RestaurantClosingCountdownState = {
  deadline: Date;
  label: string;
  display: string;
  remainingMs: number;
  isExpired: boolean;
};

export function resolveRestaurantClosingCountdown(
  now: Date,
  timezone: string,
  context?: PromotionCountdownContext | null,
): RestaurantClosingCountdownState | null {
  if (!context) return null;

  // Only while the business is currently within today's open hours.
  const deadline = getRestaurantClosingDeadlineWhileOpen(
    context.schedules,
    context.enabledServices,
    now,
    timezone,
  );
  if (!deadline) return null;

  const remainingMs = deadline.getTime() - now.getTime();
  const isExpired = remainingMs <= 0;
  if (isExpired) return null;

  return {
    deadline,
    label: RESTAURANT_CLOSING_COUNTDOWN_LABEL,
    display: formatCountdownDuration(remainingMs),
    remainingMs,
    isExpired: false,
  };
}

export function restaurantClosingContextKey(
  schedules: RestaurantSchedule[],
  enabledServices: RestaurantServiceType[],
): string {
  return [
    enabledServices.join(','),
    schedules.map((s) => `${s.service_type}:${s.day_of_week}:${s.closes_at}`).join('|'),
  ].join('::');
}

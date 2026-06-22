import type { Product, Promotion, RestaurantSchedule } from '@/lib/api/types';
import { parseApiTime } from '@/lib/restaurantScheduleHours';
import type { RestaurantServiceType } from '@/lib/restaurantServices';
import { PRODUCT_CATALOG_DISCOUNT_PREFIX } from './productCatalogDiscount';
import { isPromotionEffective } from './effective';
import { productsParticipatingInPromotion } from './promotionShortcuts';

const DEFAULT_TIMEZONE = 'America/Mexico_City';

export type PromotionCountdownDeadline = {
  deadline: Date;
  kind: 'daily_window' | 'restaurant_closing' | 'campaign_end';
};

export type PromotionCountdownContext = {
  schedules: RestaurantSchedule[];
  enabledServices: RestaurantServiceType[];
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

function parseHm(value: string | null | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value.split('T')[1]! : value;
  const [h, m] = normalized.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { hour: h, minute: m };
}

function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
  };
}

function getLocalWeekdayAndMinutes(
  date: Date,
  timeZone: string,
): { weekday: number; minutesOfDay: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const weekdayMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };

  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(get('minute'));
  const second = Number(get('second'));

  return {
    weekday: weekdayMap[get('weekday')] ?? 0,
    minutesOfDay: hour * 60 + minute + second / 60,
  };
}

/** Map a wall-clock time in `timeZone` to a UTC `Date`. */
export function zonedWallClockToUtc(
  dateParts: LocalDateParts,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utcMs = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hour, minute, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const parts = formatter.formatToParts(new Date(utcMs));
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? '0');

    const localYear = get('year');
    const localMonth = get('month');
    const localDay = get('day');
    let localHour = get('hour');
    if (localHour === 24) localHour = 0;
    const localMinute = get('minute');

    const targetDayMs = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day);
    const localDayMs = Date.UTC(localYear, localMonth - 1, localDay);
    const dayDelta = Math.round((targetDayMs - localDayMs) / 86_400_000);
    const timeDeltaMinutes = hour * 60 + minute - (localHour * 60 + localMinute);
    const totalDeltaMinutes = dayDelta * 24 * 60 + timeDeltaMinutes;

    if (totalDeltaMinutes === 0) break;
    utcMs += totalDeltaMinutes * 60 * 1000;
  }

  return new Date(utcMs);
}

/** Weekdays from marketing form: "Repetir solo en días específicos". */
export function promotionScheduleWeekdays(promotion: Promotion): number[] {
  const schedule = promotion.schedule;
  if (schedule?.weekdays?.length) return schedule.weekdays;
  return promotion.recurrence_weekdays ?? [];
}

/** True when marketing form has "Limitar a un horario del día" enabled. */
export function promotionHasDailyTimeLimit(promotion: Promotion): boolean {
  const schedule = promotion.schedule;
  if (schedule?.use_time_window) return true;
  if (schedule?.daily_end_time || schedule?.daily_start_time) return true;
  return Boolean(promotion.recurrence_start_time || promotion.recurrence_end_time);
}

function isPromotionScheduledForToday(promotion: Promotion, now: Date, timezone: string): boolean {
  const weekdays = promotionScheduleWeekdays(promotion);
  if (weekdays.length === 0) return true;

  const { weekday } = getLocalWeekdayAndMinutes(now, timezone);
  return weekdays.includes(weekday);
}

/** Countdown to today's "Hasta" from the marketing promo schedule. */
function getTodayPromoWindowEnd(
  promotion: Promotion,
  now: Date,
  timezone: string,
): PromotionCountdownDeadline | null {
  const schedule = promotion.schedule;
  const endHm = parseHm(schedule?.daily_end_time ?? promotion.recurrence_end_time);
  if (!endHm) return null;

  const dateParts = getLocalDateParts(now, timezone);
  const dailyEnd = zonedWallClockToUtc(dateParts, endHm.hour, endHm.minute, timezone);
  if (dailyEnd <= now) return null;

  return { deadline: dailyEnd, kind: 'daily_window' };
}

export function getRestaurantClosingDeadlineToday(
  schedules: RestaurantSchedule[],
  enabledServices: RestaurantServiceType[],
  now: Date,
  timezone: string,
): Date | null {
  if (schedules.length === 0 || enabledServices.length === 0) return null;

  const { weekday, minutesOfDay } = getLocalWeekdayAndMinutes(now, timezone);
  const relevant = schedules.filter((entry) =>
    enabledServices.includes(entry.service_type as RestaurantServiceType),
  );

  let soonestCloseMinutes: number | null = null;

  for (const slot of relevant) {
    if (slot.day_of_week !== weekday) continue;

    const closeHm = parseHm(parseApiTime(slot.closes_at));
    if (!closeHm) continue;

    const closeMinutes = closeHm.hour * 60 + closeHm.minute;
    if (closeMinutes <= minutesOfDay) continue;

    if (soonestCloseMinutes == null || closeMinutes < soonestCloseMinutes) {
      soonestCloseMinutes = closeMinutes;
    }
  }

  if (soonestCloseMinutes == null) return null;

  const dateParts = getLocalDateParts(now, timezone);
  return zonedWallClockToUtc(
    dateParts,
    Math.floor(soonestCloseMinutes / 60),
    soonestCloseMinutes % 60,
    timezone,
  );
}

/**
 * Countdown priority:
 * 1. Marketing promo "Hasta" when "Limitar a un horario del día" is configured (today, valid weekday).
 * 2. Restaurant closing today when the promo has no daily time limit.
 * 3. Campaign end date as last resort.
 */
export function getPromotionCountdownDeadline(
  promotion: Promotion,
  now: Date,
  timezone = DEFAULT_TIMEZONE,
  context?: PromotionCountdownContext,
): PromotionCountdownDeadline | null {
  if (!isPromotionEffective(promotion, now, timezone)) return null;
  if (!isPromotionScheduledForToday(promotion, now, timezone)) return null;

  if (promotionHasDailyTimeLimit(promotion)) {
    return getTodayPromoWindowEnd(promotion, now, timezone);
  }

  if (context) {
    const restaurantClose = getRestaurantClosingDeadlineToday(
      context.schedules,
      context.enabledServices,
      now,
      timezone,
    );
    if (restaurantClose && restaurantClose > now) {
      return { deadline: restaurantClose, kind: 'restaurant_closing' };
    }
  }

  if (promotion.ends_at) {
    const campaignEnd = new Date(promotion.ends_at);
    if (campaignEnd > now) {
      return { deadline: campaignEnd, kind: 'campaign_end' };
    }
  }

  return null;
}

export function isMarketingCountdownPromotion(promotion: Promotion): boolean {
  return !promotion.name.startsWith(PRODUCT_CATALOG_DISCOUNT_PREFIX);
}

export function getSoonestTimeLimitedPromotionForProduct(
  product: Product,
  promotions: Promotion[],
  now: Date,
  timezone = DEFAULT_TIMEZONE,
  context?: PromotionCountdownContext,
): Promotion | null {
  let bestPromotion: Promotion | null = null;
  let bestDeadlineMs: number | null = null;

  for (const promotion of promotions) {
    if (!isMarketingCountdownPromotion(promotion)) continue;
    if (!isPromotionEffective(promotion, now, timezone)) continue;
    if (productsParticipatingInPromotion([product], promotion).length === 0) continue;

    const deadline = getPromotionCountdownDeadline(promotion, now, timezone, context);
    if (!deadline) continue;

    const deadlineMs = deadline.deadline.getTime();
    if (bestDeadlineMs == null || deadlineMs < bestDeadlineMs) {
      bestPromotion = promotion;
      bestDeadlineMs = deadlineMs;
    }
  }

  return bestPromotion;
}

export function buildProductTimeLimitedPromotionMap(
  products: Product[],
  promotions: Promotion[],
  now: Date,
  timezone = DEFAULT_TIMEZONE,
  context?: PromotionCountdownContext,
): Map<string, Promotion> {
  const map = new Map<string, Promotion>();

  for (const product of products) {
    const promotion = getSoonestTimeLimitedPromotionForProduct(
      product,
      promotions,
      now,
      timezone,
      context,
    );
    if (promotion) {
      map.set(product.id, promotion);
    }
  }

  return map;
}

export function formatCountdownDuration(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function promotionCountdownLabel(kind: PromotionCountdownDeadline['kind']): string {
  switch (kind) {
    case 'daily_window':
      return 'Termina hoy en';
    case 'restaurant_closing':
      return 'Promo termina en';
    case 'campaign_end':
      return 'Termina en';
  }
}

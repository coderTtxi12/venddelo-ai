import type { Promotion } from '@/lib/api/types';

const DEFAULT_TIMEZONE = 'America/Mexico_City';

function localParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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

  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const second = Number(get('second'));

  return {
    weekday: weekdayMap[get('weekday')] ?? 0,
    minutesOfDay: hour * 60 + minute + second / 60,
  };
}

function parseHm(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function isPromotionEffective(
  promotion: Promotion,
  now: Date,
  timezone = DEFAULT_TIMEZONE,
): boolean {
  if (!promotion.is_active) return false;

  if (promotion.starts_at && now < new Date(promotion.starts_at)) return false;
  if (promotion.ends_at && now >= new Date(promotion.ends_at)) return false;

  const schedule = promotion.schedule;
  const weekdays =
    schedule?.weekdays?.length ? schedule.weekdays : promotion.recurrence_weekdays ?? [];
  const local = localParts(now, timezone);

  if (weekdays.length > 0 && !weekdays.includes(local.weekday)) {
    return false;
  }

  const useWindow = schedule?.use_time_window ?? Boolean(
    promotion.recurrence_start_time || promotion.recurrence_end_time,
  );
  if (useWindow) {
    const start =
      parseHm(schedule?.daily_start_time ?? promotion.recurrence_start_time) ?? 0;
    const end =
      parseHm(schedule?.daily_end_time ?? promotion.recurrence_end_time) ?? 24 * 60 - 1 / 60;
    if (!(local.minutesOfDay >= start && local.minutesOfDay < end)) {
      return false;
    }
  }

  return true;
}

export function filterEffectivePromotions(
  promotions: Promotion[],
  now: Date,
  timezone = DEFAULT_TIMEZONE,
): Promotion[] {
  return promotions.filter((promotion) => isPromotionEffective(promotion, now, timezone));
}

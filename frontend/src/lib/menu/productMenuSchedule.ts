import type { Product, ProductMenuSchedule } from '@/lib/api/types';
import { WEEKDAY_LABELS } from '@/lib/restaurantScheduleHours';

export type ProductMenuScheduleDraft = {
  enabled: boolean;
  useWeekdays: boolean;
  weekdays: number[];
  useTimeWindow: boolean;
  dailyStartTime: string;
  dailyEndTime: string;
};

export const DEFAULT_PRODUCT_MENU_SCHEDULE_DRAFT: ProductMenuScheduleDraft = {
  enabled: false,
  useWeekdays: false,
  weekdays: [],
  useTimeWindow: false,
  dailyStartTime: '09:00',
  dailyEndTime: '22:00',
};

export const PRODUCT_MENU_WEEKDAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

export function toggleProductMenuWeekday(list: number[], dayIndex: number): number[] {
  return list.includes(dayIndex)
    ? list.filter((day) => day !== dayIndex)
    : [...list, dayIndex].sort((a, b) => a - b);
}

export function productMenuScheduleFromApi(
  schedule: ProductMenuSchedule | null | undefined,
): ProductMenuScheduleDraft {
  if (!schedule) {
    return { ...DEFAULT_PRODUCT_MENU_SCHEDULE_DRAFT };
  }
  const hasWeekdays = schedule.weekdays.length > 0;
  const hasWindow = schedule.use_time_window;
  return {
    enabled: hasWeekdays || hasWindow,
    useWeekdays: hasWeekdays,
    weekdays: [...schedule.weekdays],
    useTimeWindow: hasWindow,
    dailyStartTime: schedule.daily_start_time ?? DEFAULT_PRODUCT_MENU_SCHEDULE_DRAFT.dailyStartTime,
    dailyEndTime: schedule.daily_end_time ?? DEFAULT_PRODUCT_MENU_SCHEDULE_DRAFT.dailyEndTime,
  };
}

export function productMenuScheduleToApi(
  draft: ProductMenuScheduleDraft,
): ProductMenuSchedule | null {
  if (!draft.enabled) return null;
  const useWeekdays = draft.useWeekdays && draft.weekdays.length > 0;
  const useTimeWindow = draft.useTimeWindow;
  if (!useWeekdays && !useTimeWindow) return null;
  return {
    weekdays: useWeekdays ? draft.weekdays : [],
    use_time_window: useTimeWindow,
    daily_start_time: useTimeWindow ? draft.dailyStartTime : null,
    daily_end_time: useTimeWindow ? draft.dailyEndTime : null,
  };
}

export function hasProductMenuSchedule(product: Product): boolean {
  const schedule = product.menu_schedule;
  if (!schedule) return false;
  if (schedule.weekdays.length > 0) return true;
  return schedule.use_time_window;
}

function localParts(date: Date, timeZone: string) {
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

function parseHm(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value.split('T')[1]! : value;
  const [h, m] = normalized.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function isProductMenuScheduleActive(
  product: Product,
  now: Date,
  timezone = 'America/Mexico_City',
): boolean {
  const schedule = product.menu_schedule;
  if (!schedule) return true;

  const weekdays = schedule.weekdays;
  const local = localParts(now, timezone);

  if (weekdays.length > 0 && !weekdays.includes(local.weekday)) {
    return false;
  }

  if (schedule.use_time_window) {
    const start = parseHm(schedule.daily_start_time) ?? 0;
    const end = parseHm(schedule.daily_end_time) ?? 24 * 60 - 1 / 60;
    if (!(local.minutesOfDay >= start && local.minutesOfDay < end)) {
      return false;
    }
  }

  return true;
}

function formatPreviewTime(value: string): string {
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const period = h >= 12 ? 'p.m.' : 'a.m.';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export const PRODUCT_OUTSIDE_SCHEDULE_LABEL = 'Fuera de horario';

export type ProductOutsideScheduleCopy = {
  badge: string;
  when: string;
  notice: string;
  aria: string;
};

const WEEKDAY_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'] as const;

function weekdayPhrase(weekdays: number[]): string | null {
  const unique = [...new Set(weekdays.filter((day) => day >= 0 && day <= 6))].sort((a, b) => a - b);
  if (unique.length === 0 || unique.length === 7) return null;
  const names = unique.map((day) => WEEKDAY_PLURAL[day]);
  if (names.length === 1) return `los ${names[0]}`;
  if (names.length === 2) return `los ${names[0]} y ${names[1]}`;
  return `los ${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

function timePhrase(schedule: ProductMenuSchedule): string | null {
  if (!schedule.use_time_window || !schedule.daily_start_time || !schedule.daily_end_time) {
    return null;
  }
  return `de ${formatPreviewTime(schedule.daily_start_time)} a ${formatPreviewTime(schedule.daily_end_time)}`;
}

function capitalizeSentence(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Copy for a listed product that cannot be ordered until its schedule opens. */
export function productOutsideScheduleCopy(
  product: Product,
  now: Date,
  timezone = 'America/Mexico_City',
): ProductOutsideScheduleCopy | null {
  if (product.status !== 'active') return null;
  if (!hasProductMenuSchedule(product)) return null;
  if (isProductMenuScheduleActive(product, now, timezone)) return null;
  const schedule = product.menu_schedule;
  if (!schedule) return null;

  const days = weekdayPhrase(schedule.weekdays);
  const time = timePhrase(schedule);
  const when = days && time ? `${days}, ${time}` : days ? `solo ${days}` : time ? time : 'en su horario';
  const notice = `Se puede pedir ${when.replace(/\.$/, '')}. Ahora está fuera de ese horario.`;

  return {
    badge: PRODUCT_OUTSIDE_SCHEDULE_LABEL,
    when: capitalizeSentence(when),
    notice,
    aria: `fuera de horario. ${notice}`,
  };
}

export function formatProductMenuScheduleSummary(
  schedule: ProductMenuSchedule | null | undefined,
): string | null {
  if (!schedule) return null;
  const days =
    schedule.weekdays.length > 0
      ? schedule.weekdays.map((day) => WEEKDAY_LABELS[day]).join(' · ')
      : null;
  const time =
    schedule.use_time_window && schedule.daily_start_time && schedule.daily_end_time
      ? `${formatPreviewTime(schedule.daily_start_time)}–${formatPreviewTime(schedule.daily_end_time)}`
      : null;

  if (days && time) return `${days} · ${time}`;
  if (days) return `Solo ${days.toLowerCase()}`;
  if (time) return `De ${time}`;
  return null;
}

export function validateProductMenuScheduleDraft(draft: ProductMenuScheduleDraft): string | null {
  if (!draft.enabled) return null;
  if (!draft.useWeekdays && !draft.useTimeWindow) {
    return 'Activa días específicos o un horario del día, o desactiva el horario de pedido.';
  }
  if (draft.useWeekdays && draft.weekdays.length === 0) {
    return 'Selecciona al menos un día.';
  }
  if (draft.useTimeWindow) {
    if (!draft.dailyStartTime || !draft.dailyEndTime) {
      return 'Indica hora de inicio y fin.';
    }
    if (draft.dailyStartTime >= draft.dailyEndTime) {
      return 'La hora de fin debe ser posterior a la de inicio.';
    }
  }
  return null;
}

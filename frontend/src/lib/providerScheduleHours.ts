import type {
  DeliveryProviderSchedule,
  DeliveryProviderScheduleKind,
} from '@/lib/api/types';

export const WEEKDAY_LABELS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

export const SCHEDULE_KIND_ORDER: DeliveryProviderScheduleKind[] = ['regular', 'night'];

export const SCHEDULE_KIND_LABELS: Record<DeliveryProviderScheduleKind, string> = {
  regular: 'Horario de día',
  night: 'Horario nocturno',
};

export type KindScheduleDraft = {
  scheduleKind: DeliveryProviderScheduleKind;
  label: string;
  days: Array<{
    dayIndex: number;
    label: string;
    isToday: boolean;
    isClosed: boolean;
    slots: string[];
  }>;
};

function getTodayDayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function parseApiTime(value: string): string {
  return value.slice(0, 5);
}

export function formatScheduleTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;

  const minute = match[2]!;
  let hour = parseInt(match[1]!, 10);
  const period = hour >= 12 ? 'p.m.' : 'a.m.';

  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;

  return minute === '00' ? `${hour} ${period}` : `${hour}:${minute} ${period}`;
}

export function formatTimeRange(opensAt: string, closesAt: string): string {
  return `${formatScheduleTime(opensAt)} – ${formatScheduleTime(closesAt)}`;
}

export function buildProviderScheduleBlocks(
  schedules: DeliveryProviderSchedule[],
  kinds: DeliveryProviderScheduleKind[] = SCHEDULE_KIND_ORDER,
): KindScheduleDraft[] {
  const todayIndex = getTodayDayIndex();

  return kinds.map((scheduleKind) => {
    const kindSchedules = schedules.filter((entry) => entry.schedule_kind === scheduleKind);

    const days = WEEKDAY_LABELS.map((label, dayIndex) => {
      const slots = kindSchedules
        .filter((entry) => entry.day_of_week === dayIndex)
        .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
        .map((entry) => formatTimeRange(parseApiTime(entry.opens_at), parseApiTime(entry.closes_at)));

      return {
        dayIndex,
        label,
        isToday: dayIndex === todayIndex,
        isClosed: slots.length === 0,
        slots,
      };
    });

    return {
      scheduleKind,
      label: SCHEDULE_KIND_LABELS[scheduleKind],
      days,
    };
  });
}

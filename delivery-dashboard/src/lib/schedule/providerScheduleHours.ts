import type {
  DeliveryProviderSchedule,
  DeliveryProviderScheduleCreateInput,
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
  regular: 'Horario diurno',
  night: 'Horario nocturno',
};

export const DEFAULT_SLOTS: Record<DeliveryProviderScheduleKind, { opensAt: string; closesAt: string }> =
  {
    regular: { opensAt: '09:00', closesAt: '21:00' },
    night: { opensAt: '21:00', closesAt: '22:00' },
  };

export type ScheduleSlotDraft = {
  opensAt: string;
  closesAt: string;
};

export type DayScheduleDraft = {
  dayIndex: number;
  label: string;
  isToday: boolean;
  isClosed: boolean;
  slots: ScheduleSlotDraft[];
};

export type KindScheduleDraft = {
  scheduleKind: DeliveryProviderScheduleKind;
  label: string;
  days: DayScheduleDraft[];
};

export function getTodayDayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function parseApiTime(value: string): string {
  return value.slice(0, 5);
}

export function toApiTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

export function createDefaultSlot(kind: DeliveryProviderScheduleKind): ScheduleSlotDraft {
  return { ...DEFAULT_SLOTS[kind] };
}

export function buildScheduleDrafts(
  schedules: DeliveryProviderSchedule[],
  kinds: DeliveryProviderScheduleKind[] = SCHEDULE_KIND_ORDER,
): KindScheduleDraft[] {
  const todayIndex = getTodayDayIndex();

  return kinds.map((scheduleKind) => {
    const kindSchedules = schedules.filter((entry) => entry.schedule_kind === scheduleKind);

    const days = WEEKDAY_LABELS.map((label, dayIndex) => {
      const dayEntries = kindSchedules
        .filter((entry) => entry.day_of_week === dayIndex)
        .sort((a, b) => a.opens_at.localeCompare(b.opens_at));

      const slots =
        dayEntries.length > 0
          ? dayEntries.map((entry) => ({
              opensAt: parseApiTime(entry.opens_at),
              closesAt: parseApiTime(entry.closes_at),
            }))
          : [];

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

export function scheduleDraftsToCreatePayload(
  drafts: KindScheduleDraft[],
): DeliveryProviderScheduleCreateInput[] {
  const payload: DeliveryProviderScheduleCreateInput[] = [];

  for (const block of drafts) {
    for (const day of block.days) {
      if (day.isClosed) continue;

      for (const slot of day.slots) {
        if (!slot.opensAt || !slot.closesAt) continue;
        payload.push({
          schedule_kind: block.scheduleKind,
          day_of_week: day.dayIndex,
          opens_at: toApiTime(slot.opensAt),
          closes_at: toApiTime(slot.closesAt),
        });
      }
    }
  }

  return payload;
}

export function validateScheduleDrafts(drafts: KindScheduleDraft[]): string | null {
  for (const block of drafts) {
    for (const day of block.days) {
      if (day.isClosed) continue;

      if (day.slots.length === 0) {
        return `${day.label} (${block.label}): agrega al menos un turno o márcalo como cerrado.`;
      }

      for (const slot of day.slots) {
        if (!slot.opensAt || !slot.closesAt) {
          return `${day.label} (${block.label}): completa hora de apertura y cierre.`;
        }
        if (slot.opensAt >= slot.closesAt) {
          return `${day.label} (${block.label}): la hora de cierre debe ser posterior a la de apertura.`;
        }
      }
    }
  }

  return null;
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

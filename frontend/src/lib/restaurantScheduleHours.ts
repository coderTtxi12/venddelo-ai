import type { RestaurantSchedule, RestaurantScheduleCreateInput } from '@/lib/api/types';
import {
  RESTAURANT_SERVICE_LABELS,
  RESTAURANT_SERVICE_ORDER,
  type RestaurantServiceType,
} from '@/lib/restaurantServices';

export const WEEKDAY_LABELS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

export type DayHoursRow = {
  dayIndex: number;
  label: string;
  slots: string[];
  isClosed: boolean;
  isToday: boolean;
};

export type ServiceHoursBlock = {
  serviceType: RestaurantServiceType;
  label: string;
  days: DayHoursRow[];
};

const TIME_RE = /^(\d{1,2}):(\d{2})/;

export function getTodayDayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function formatScheduleTime(value: string): string {
  const match = TIME_RE.exec(value);
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

export function buildWeeklyHoursForService(
  schedules: RestaurantSchedule[],
  serviceType: RestaurantServiceType,
  todayIndex = getTodayDayIndex(),
): DayHoursRow[] {
  const serviceSchedules = schedules.filter((entry) => entry.service_type === serviceType);

  return WEEKDAY_LABELS.map((label, dayIndex) => {
    const slots = serviceSchedules
      .filter((entry) => entry.day_of_week === dayIndex)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
      .map((entry) => formatTimeRange(entry.opens_at, entry.closes_at));

    return {
      dayIndex,
      label,
      slots,
      isClosed: slots.length === 0,
      isToday: dayIndex === todayIndex,
    };
  });
}

export function buildRestaurantHoursBlocks(
  schedules: RestaurantSchedule[],
  enabledServices: RestaurantServiceType[],
): ServiceHoursBlock[] {
  const requestedServices =
    enabledServices.length > 0 ? enabledServices : RESTAURANT_SERVICE_ORDER;

  const serviceTypesWithSchedules = requestedServices.filter((serviceType) =>
    schedules.some((entry) => entry.service_type === serviceType),
  );

  const serviceTypes =
    serviceTypesWithSchedules.length > 0 ? serviceTypesWithSchedules : requestedServices;

  return serviceTypes.map((serviceType) => ({
    serviceType,
    label: RESTAURANT_SERVICE_LABELS[serviceType],
    days: buildWeeklyHoursForService(schedules, serviceType),
  }));
}

export function hasAnyConfiguredHours(schedules: RestaurantSchedule[]): boolean {
  return schedules.length > 0;
}

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

export type ServiceScheduleDraft = {
  serviceType: RestaurantServiceType;
  label: string;
  days: DayScheduleDraft[];
};

const DEFAULT_SLOT: ScheduleSlotDraft = { opensAt: '09:00', closesAt: '18:00' };

export function parseApiTime(value: string): string {
  return value.slice(0, 5);
}

export function toApiTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

export function buildScheduleDrafts(
  schedules: RestaurantSchedule[],
  serviceTypes: RestaurantServiceType[] = RESTAURANT_SERVICE_ORDER,
): ServiceScheduleDraft[] {
  const todayIndex = getTodayDayIndex();

  return serviceTypes.map((serviceType) => {
    const serviceSchedules = schedules.filter((entry) => entry.service_type === serviceType);

    const days = WEEKDAY_LABELS.map((label, dayIndex) => {
      const dayEntries = serviceSchedules
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
      serviceType,
      label: RESTAURANT_SERVICE_LABELS[serviceType],
      days,
    };
  });
}

export function scheduleDraftsToCreatePayload(
  drafts: ServiceScheduleDraft[],
): RestaurantScheduleCreateInput[] {
  const payload: RestaurantScheduleCreateInput[] = [];

  for (const block of drafts) {
    for (const day of block.days) {
      if (day.isClosed) continue;

      for (const slot of day.slots) {
        if (!slot.opensAt || !slot.closesAt) continue;
        payload.push({
          service_type: block.serviceType,
          day_of_week: day.dayIndex,
          opens_at: toApiTime(slot.opensAt),
          closes_at: toApiTime(slot.closesAt),
        });
      }
    }
  }

  return payload;
}

/** Conserva horarios de delivery al guardar solo takeout desde el panel del restaurante. */
export function mergeScheduleSavePreservingDelivery(
  takeoutPayload: RestaurantScheduleCreateInput[],
  existingSchedules: RestaurantSchedule[],
): RestaurantScheduleCreateInput[] {
  const deliveryPayload = existingSchedules
    .filter((entry) => entry.service_type === 'delivery')
    .map(({ service_type, day_of_week, opens_at, closes_at }) => ({
      service_type,
      day_of_week,
      opens_at,
      closes_at,
    }));

  return [...takeoutPayload, ...deliveryPayload];
}

export function validateScheduleDrafts(drafts: ServiceScheduleDraft[]): string | null {
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

export function createDefaultSlot(): ScheduleSlotDraft {
  return { ...DEFAULT_SLOT };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map((part) => parseInt(part, 10));
  return hours! * 60 + minutes!;
}

export type RestaurantOpenStatus = {
  state: 'open' | 'closed' | 'unknown';
  label: string;
  detail?: string;
};

export function resolveRestaurantOpenStatus(
  schedules: RestaurantSchedule[],
  enabledServices: RestaurantServiceType[],
  now = new Date(),
): RestaurantOpenStatus {
  if (enabledServices.length === 0) {
    return { state: 'closed', label: 'Cerrado', detail: 'Sin servicios activos' };
  }

  const relevant = schedules.filter((entry) => enabledServices.includes(entry.service_type));
  if (relevant.length === 0) {
    return { state: 'unknown', label: 'Horario no configurado' };
  }

  const todayIndex = getTodayDayIndex();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todaySlots = relevant
    .filter((entry) => entry.day_of_week === todayIndex)
    .sort((a, b) => a.opens_at.localeCompare(b.opens_at));

  for (const slot of todaySlots) {
    const openMinutes = timeToMinutes(parseApiTime(slot.opens_at));
    const closeMinutes = timeToMinutes(parseApiTime(slot.closes_at));
    if (nowMinutes >= openMinutes && nowMinutes < closeMinutes) {
      return {
        state: 'open',
        label: 'Abierto',
        detail: `Hasta ${formatScheduleTime(slot.closes_at)}`,
      };
    }
  }

  const laterToday = todaySlots.find(
    (slot) => timeToMinutes(parseApiTime(slot.opens_at)) > nowMinutes,
  );
  if (laterToday) {
    return {
      state: 'closed',
      label: 'Cerrado',
      detail: `Abre hoy ${formatScheduleTime(laterToday.opens_at)}`,
    };
  }

  if (todaySlots.length === 0) {
    const next = findNextOpening(relevant, todayIndex, nowMinutes);
    return {
      state: 'closed',
      label: 'Cerrado',
      detail: next?.detail ?? 'Hoy sin servicio',
    };
  }

  const next = findNextOpening(relevant, todayIndex, nowMinutes);
  return {
    state: 'closed',
    label: 'Cerrado',
    detail: next?.detail,
  };
}

function findNextOpening(
  schedules: RestaurantSchedule[],
  todayIndex: number,
  nowMinutes: number,
): { detail: string } | null {
  const laterToday = schedules
    .filter((entry) => entry.day_of_week === todayIndex)
    .filter((entry) => timeToMinutes(parseApiTime(entry.opens_at)) > nowMinutes)
    .sort((a, b) => a.opens_at.localeCompare(b.opens_at))[0];

  if (laterToday) {
    return { detail: `Abre hoy ${formatScheduleTime(laterToday.opens_at)}` };
  }

  for (let offset = 1; offset <= 7; offset += 1) {
    const dayIndex = (todayIndex + offset) % 7;
    const daySlot = schedules
      .filter((entry) => entry.day_of_week === dayIndex)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at))[0];

    if (!daySlot) continue;

    const dayLabel =
      offset === 1 ? 'mañana' : `el ${WEEKDAY_LABELS[dayIndex]!.toLowerCase()}`;
    return { detail: `Abre ${dayLabel} ${formatScheduleTime(daySlot.opens_at)}` };
  }

  return null;
}

import { WEEKDAY_LABELS } from '@/lib/restaurantScheduleHours';

/** 0=Lunes … 6=Domingo (misma convención que promociones y horarios). */
export const COUPON_WEEKDAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

export function toggleCouponWeekday(list: number[], dayIndex: number): number[] {
  return list.includes(dayIndex)
    ? list.filter((day) => day !== dayIndex)
    : [...list, dayIndex].sort((a, b) => a - b);
}

export function normalizeCouponWeekdays(weekdays: number[] | null | undefined): number[] | null {
  if (!weekdays?.length) return null;
  const normalized = [...new Set(weekdays.filter((day) => day >= 0 && day <= 6))].sort(
    (a, b) => a - b,
  );
  return normalized.length > 0 ? normalized : null;
}

export function formatCouponWeekdaysLabel(weekdays: number[] | null | undefined): string | null {
  const normalized = normalizeCouponWeekdays(weekdays);
  if (!normalized) return null;
  return normalized.map((day) => WEEKDAY_LABELS[day]).join(' · ');
}

export function formatCouponWeekdaysSummary(weekdays: number[] | null | undefined): string {
  const label = formatCouponWeekdaysLabel(weekdays);
  return label ? `Solo ${label.toLowerCase()}` : 'Todos los días';
}

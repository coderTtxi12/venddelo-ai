export type HistoryPeriod =
  | 'today'
  | 'yesterday'
  | 'day_before'
  | 'week'
  | 'month'
  | 'custom';

export type HistoryDateRange = {
  start: string;
  end: string;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatHistoryQueryDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function dateOnly(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function shiftDays(day: Date, days: number): Date {
  const next = new Date(day);
  next.setDate(day.getDate() + days);
  return next;
}

function singleDay(day: Date): HistoryDateRange {
  const iso = formatHistoryQueryDate(day);
  return { start: iso, end: iso };
}

export function historyDateRange(
  period: HistoryPeriod,
  now: Date,
  customStart?: Date | null,
  customEnd?: Date | null,
): HistoryDateRange {
  const day = dateOnly(now);
  if (period === 'today') return singleDay(day);
  if (period === 'yesterday') return singleDay(shiftDays(day, -1));
  if (period === 'day_before') return singleDay(shiftDays(day, -2));
  if (period === 'week') {
    const monday = new Date(day);
    monday.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: formatHistoryQueryDate(monday), end: formatHistoryQueryDate(sunday) };
  }
  if (period === 'month') {
    const start = new Date(day.getFullYear(), day.getMonth(), 1);
    const end = new Date(day.getFullYear(), day.getMonth() + 1, 0);
    return { start: formatHistoryQueryDate(start), end: formatHistoryQueryDate(end) };
  }
  const start = customStart ? dateOnly(customStart) : day;
  const end = customEnd ? dateOnly(customEnd) : day;
  return { start: formatHistoryQueryDate(start), end: formatHistoryQueryDate(end) };
}

function parseIsoDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function comparisonDateRange(start: string, end: string): HistoryDateRange {
  const startDay = parseIsoDay(start);
  const endDay = parseIsoDay(end);
  const lastOfMonth = new Date(startDay.getFullYear(), startDay.getMonth() + 1, 0);
  const isFullMonth =
    startDay.getDate() === 1 && endDay.getTime() === lastOfMonth.getTime();
  if (isFullMonth) {
    const prevEnd = shiftDays(startDay, -1);
    const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
    return {
      start: formatHistoryQueryDate(prevStart),
      end: formatHistoryQueryDate(prevEnd),
    };
  }
  const span = Math.round((endDay.getTime() - startDay.getTime()) / 86400000) + 1;
  const prevEnd = shiftDays(startDay, -1);
  const prevStart = shiftDays(prevEnd, -(span - 1));
  return {
    start: formatHistoryQueryDate(prevStart),
    end: formatHistoryQueryDate(prevEnd),
  };
}

export type StatsGranularity = 'hourly' | 'daily' | 'weekly';

export function statsGranularity(start: string, end: string): StatsGranularity {
  const startDay = parseIsoDay(start);
  const endDay = parseIsoDay(end);
  const days = Math.round((endDay.getTime() - startDay.getTime()) / 86400000) + 1;
  if (days <= 1) return 'hourly';
  if (days <= 31) return 'daily';
  return 'weekly';
}

export function rangeDayCount(start: string, end: string): number {
  const startDay = parseIsoDay(start);
  const endDay = parseIsoDay(end);
  return Math.round((endDay.getTime() - startDay.getTime()) / 86400000) + 1;
}

export function isSameLengthRange(
  left: HistoryDateRange,
  right: HistoryDateRange,
): boolean {
  return rangeDayCount(left.start, left.end) === rangeDayCount(right.start, right.end);
}

export function formatChangePct(pct: number | null | undefined): string {
  if (pct == null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}

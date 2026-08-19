export type HistoryPeriod = 'today' | 'week' | 'month' | 'custom';

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

export function historyDateRange(
  period: HistoryPeriod,
  now: Date,
  customStart?: Date | null,
  customEnd?: Date | null,
): HistoryDateRange {
  const day = dateOnly(now);
  if (period === 'today') {
    const iso = formatHistoryQueryDate(day);
    return { start: iso, end: iso };
  }
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

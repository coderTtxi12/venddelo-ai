export const AFFILIATE_GOAL = 100;
export const TREND_START = '2026-09-01';
export const AFFILIATE_EXCLUSIONS_KEY = 'mexy-affiliate-goal-exclusions-v1';
export const MEXICO_TZ = 'America/Mexico_City';

const MAX_SIM_WEEKS = 156;
const MAX_CHART_WEEKS = 18;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export type AffiliateRecord = {
  restaurantId: string;
  activatedAt: string;
  onHold: boolean;
};

export type AffiliateWeek = {
  start: string;
  end: string;
  label: string;
  joinedActive: number;
  joinedHold: number;
  cumulativeActive: number;
  partial: boolean;
};

export type AffiliateForecastPoint = {
  start: string;
  label: string;
  value: number;
};

export type AffiliateGoalSnapshot = {
  goal: number;
  active: number;
  onHold: number;
  excluded: number;
  baselineActive: number;
  septemberJoined: number;
  septemberHold: number;
  weeksElapsed: number;
  weeklyNet: number;
  weeksToGoal: number | null;
  projectedDate: string | null;
  reached: boolean;
  weeks: AffiliateWeek[];
  forecast: AffiliateForecastPoint[];
};

export type AffiliateChartRow = {
  label: string;
  joinedActive: number | null;
  joinedHold: number | null;
  cumulative: number | null;
  forecast: number | null;
};

export function mexicoDay(instant: Date | string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MEXICO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function isoDayDiff(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export function formatSpanishDay(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  const year = iso.slice(0, 4);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatWeekLabel(start: string, end: string): string {
  const [, startMonth, startDay] = start.split('-').map(Number);
  const [, endMonth, endDay] = end.split('-').map(Number);
  if (startMonth === endMonth) return `${startDay}–${endDay} ${MONTHS[startMonth - 1]}`;
  return `${startDay} ${MONTHS[startMonth - 1]}–${endDay} ${MONTHS[endMonth - 1]}`;
}

export function formatWeeklyPace(weeklyNet: number): string {
  const formatted = new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(weeklyNet);
  return `${formatted} por semana`;
}

function uniqueIds(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
  }
  return next;
}

export function parseAffiliateExclusions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return uniqueIds(parsed.map(String));
  } catch {
    return [];
  }
}

export function serializeAffiliateExclusions(ids: string[]): string {
  return JSON.stringify(uniqueIds(ids));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildForecast(
  today: string,
  active: number,
  weeklyNet: number,
): Pick<AffiliateGoalSnapshot, 'weeksToGoal' | 'projectedDate' | 'forecast' | 'reached'> {
  if (active >= AFFILIATE_GOAL) {
    return { reached: true, weeksToGoal: 0, projectedDate: today, forecast: [] };
  }
  if (weeklyNet <= 0) {
    return { reached: false, weeksToGoal: null, projectedDate: null, forecast: [] };
  }

  const weeksToGoal = (AFFILIATE_GOAL - active) / weeklyNet;
  const projectedDate = addIsoDays(today, Math.round(weeksToGoal * 7));
  const steps = Math.min(MAX_CHART_WEEKS, MAX_SIM_WEEKS, Math.ceil(weeksToGoal));
  const forecast: AffiliateForecastPoint[] = [];
  for (let step = 1; step <= steps; step += 1) {
    const start = addIsoDays(today, step * 7);
    forecast.push({
      start,
      label: formatWeekLabel(start, addIsoDays(start, 6)),
      value: round1(active + weeklyNet * step),
    });
  }
  return { reached: false, weeksToGoal, projectedDate, forecast };
}

export function buildAffiliateGoal(
  records: AffiliateRecord[],
  excludedIds: Iterable<string>,
  today: string,
): AffiliateGoalSnapshot {
  const excluded = new Set(excludedIds);
  const counted = records.filter((record) => !excluded.has(record.restaurantId));
  const activeRecords = counted.filter((record) => !record.onHold);
  const holdRecords = counted.filter((record) => record.onHold);
  const active = activeRecords.length;
  const onHold = holdRecords.length;

  const dayOf = (record: AffiliateRecord) => mexicoDay(record.activatedAt);
  const baselineActive = activeRecords.filter((record) => dayOf(record) < TREND_START).length;
  const septemberRecords = counted.filter((record) => dayOf(record) >= TREND_START);
  const septemberJoined = septemberRecords.length;
  const septemberHold = septemberRecords.filter((record) => record.onHold).length;

  const weeks: AffiliateWeek[] = [];
  if (today >= TREND_START) {
    let cursor = TREND_START;
    while (cursor <= today) {
      const end = addIsoDays(cursor, 6);
      weeks.push({
        start: cursor,
        end,
        label: formatWeekLabel(cursor, end),
        joinedActive: 0,
        joinedHold: 0,
        cumulativeActive: 0,
        partial: today < end,
      });
      cursor = addIsoDays(end, 1);
    }
  }

  for (const record of counted) {
    const day = dayOf(record);
    if (day < TREND_START) continue;
    const index =
      day > today
        ? weeks.length - 1
        : weeks.findIndex((week) => day >= week.start && day <= week.end);
    if (index < 0) continue;
    if (record.onHold) weeks[index].joinedHold += 1;
    else weeks[index].joinedActive += 1;
  }

  let running = baselineActive;
  for (const week of weeks) {
    running += week.joinedActive;
    week.cumulativeActive = running;
  }

  const daysObserved = today >= TREND_START ? isoDayDiff(TREND_START, today) + 1 : 0;
  const weeksElapsed = daysObserved / 7;
  const weeklyNet = weeksElapsed > 0 ? (active - baselineActive) / weeksElapsed : 0;
  const forecast = buildForecast(today, active, weeklyNet);

  return {
    goal: AFFILIATE_GOAL,
    active,
    onHold,
    excluded: records.length - counted.length,
    baselineActive,
    septemberJoined,
    septemberHold,
    weeksElapsed,
    weeklyNet,
    weeksToGoal: forecast.weeksToGoal,
    projectedDate: forecast.projectedDate,
    reached: forecast.reached,
    weeks,
    forecast: forecast.forecast,
  };
}

export function affiliateChartRows(snapshot: AffiliateGoalSnapshot): AffiliateChartRow[] {
  const rows: AffiliateChartRow[] = snapshot.weeks.map((week, index) => {
    const isLast = index === snapshot.weeks.length - 1;
    return {
      label: week.label,
      joinedActive: week.joinedActive,
      joinedHold: week.joinedHold,
      cumulative: week.cumulativeActive,
      forecast: isLast && snapshot.forecast.length > 0 ? week.cumulativeActive : null,
    };
  });
  for (const point of snapshot.forecast) {
    rows.push({
      label: point.label,
      joinedActive: null,
      joinedHold: null,
      cumulative: null,
      forecast: point.value,
    });
  }
  return rows;
}

export function affiliateForecastSentence(snapshot: AffiliateGoalSnapshot): string {
  if (snapshot.reached) return 'La meta de 100 negocios sin hold ya está cubierta.';
  if (!snapshot.projectedDate) {
    return 'Desde septiembre no suman negocios sin hold. Con este ritmo no hay fecha para los 100.';
  }
  return `A este ritmo, alrededor del ${formatSpanishDay(snapshot.projectedDate)}.`;
}

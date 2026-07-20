import type { AnalyticsPreset } from '@/lib/api/analytics';

export type AnalyticsPeriodState = {
  preset: AnalyticsPreset;
  start: string | null;
  end: string | null;
};

export const DEFAULT_ANALYTICS_PERIOD: AnalyticsPeriodState = {
  preset: '12m',
  start: null,
  end: null,
};

export const ANALYTICS_PRESET_OPTIONS: ReadonlyArray<{
  preset: AnalyticsPreset;
  label: string;
}> = [
  { preset: '7d', label: 'Últimos 7 días' },
  { preset: '4w', label: 'Últimas 4 semanas' },
  { preset: '12m', label: 'Últimos 12 meses' },
  { preset: 'custom', label: 'Personalizado' },
];

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

export function formatCustomRangeLabel(start: string, end: string): string {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  const startText = `${startDate.day} ${MONTHS_ES[startDate.month - 1]}`;
  const endText = `${endDate.day} ${MONTHS_ES[endDate.month - 1]}`;
  if (startDate.year === endDate.year) {
    return `${startText} – ${endText} ${endDate.year}`;
  }
  return `${startText} ${startDate.year} – ${endText} ${endDate.year}`;
}

export function getPresetOptionLabel(
  preset: AnalyticsPreset,
  customRange: Pick<AnalyticsPeriodState, 'start' | 'end'>,
): string {
  if (preset === 'custom' && customRange.start && customRange.end) {
    return formatCustomRangeLabel(customRange.start, customRange.end);
  }
  return ANALYTICS_PRESET_OPTIONS.find((option) => option.preset === preset)?.label ?? preset;
}

export function parseAnalyticsPeriodSearchParams(
  searchParams: URLSearchParams,
): AnalyticsPeriodState {
  const presetParam = searchParams.get('preset');
  const preset =
    presetParam === '7d' ||
    presetParam === '4w' ||
    presetParam === '12m' ||
    presetParam === 'custom'
      ? presetParam
      : '12m';

  if (preset !== 'custom') {
    return { preset, start: null, end: null };
  }

  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (start && end) {
    return { preset: 'custom', start, end };
  }

  return DEFAULT_ANALYTICS_PERIOD;
}

export function buildAnalyticsPeriodSearchParams(state: AnalyticsPeriodState): URLSearchParams {
  const params = new URLSearchParams({ preset: state.preset });
  if (state.preset === 'custom' && state.start && state.end) {
    params.set('start', state.start);
    params.set('end', state.end);
  }
  return params;
}

export function toAnalyticsPeriodQuery(state: AnalyticsPeriodState) {
  return {
    preset: state.preset,
    ...(state.preset === 'custom' && state.start && state.end
      ? { start: state.start, end: state.end }
      : {}),
  };
}

export function formatDateToIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

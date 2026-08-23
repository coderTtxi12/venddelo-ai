import type { DeliveryWeatherMode } from '@/lib/api/types';

export const WEATHER_OPTIONS: {
  mode: DeliveryWeatherMode;
  label: string;
  shortLabel: string;
  danger?: boolean;
}[] = [
  { mode: 'none', label: 'Sin lluvia', shortLabel: 'Sin lluvia' },
  { mode: 'light', label: 'Lluvia ligera', shortLabel: 'Ligera' },
  { mode: 'heavy', label: 'Lluvia fuerte', shortLabel: 'Fuerte' },
  { mode: 'intense', label: 'Lluvia intensa (suspendido)', shortLabel: 'Intensa', danger: true },
];

export function weatherModeLabel(mode: DeliveryWeatherMode | string | null | undefined): string {
  return WEATHER_OPTIONS.find((option) => option.mode === mode)?.label ?? 'Sin lluvia';
}

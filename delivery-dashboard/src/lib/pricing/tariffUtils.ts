import type {
  DeliveryProviderPricingConfig,
  OutsideTariffBracket,
} from '@/lib/api/types';

export const DEFAULT_OUTSIDE_BRACKETS: OutsideTariffBracket[] = [
  { min_km: 0, max_km: 3, repa_cents: 4500, mexy_cents: 0, restaurant_cents: 4500, rain_light_cents: 6500, rain_heavy_cents: 9500 },
  { min_km: 3.1, max_km: 4, repa_cents: 5500, mexy_cents: 0, restaurant_cents: 5500, rain_light_cents: 7500, rain_heavy_cents: 10500 },
  { min_km: 4.1, max_km: 5, repa_cents: 6500, mexy_cents: 0, restaurant_cents: 6500, rain_light_cents: 8500, rain_heavy_cents: 11500 },
  { min_km: 5.1, max_km: 6, repa_cents: 7500, mexy_cents: 0, restaurant_cents: 7500, rain_light_cents: 9500, rain_heavy_cents: 12500 },
  { min_km: 6.1, max_km: 7, repa_cents: 8500, mexy_cents: 0, restaurant_cents: 8500, rain_light_cents: 10500, rain_heavy_cents: 13500 },
  { min_km: 7.1, max_km: 8, repa_cents: 9500, mexy_cents: 0, restaurant_cents: 9500, rain_light_cents: 11500, rain_heavy_cents: 14500 },
  { min_km: 8.1, max_km: 9, repa_cents: 10500, mexy_cents: 0, restaurant_cents: 10500, rain_light_cents: 12500, rain_heavy_cents: 15500 },
  { min_km: 9.1, max_km: 10, repa_cents: 11500, mexy_cents: 0, restaurant_cents: 11500, rain_light_cents: 13500, rain_heavy_cents: 16500 },
  { min_km: 10.1, max_km: 11, repa_cents: 12500, mexy_cents: 3500, restaurant_cents: 16000, rain_light_cents: 20000, rain_heavy_cents: 24000 },
  { min_km: 11.1, max_km: 12, repa_cents: 13500, mexy_cents: 4500, restaurant_cents: 18000, rain_light_cents: 22000, rain_heavy_cents: 26000 },
  { min_km: 12.1, max_km: 13, repa_cents: 14500, mexy_cents: 5500, restaurant_cents: 20000, rain_light_cents: 24000, rain_heavy_cents: 28000 },
  { min_km: 13.1, max_km: 14, repa_cents: 15500, mexy_cents: 6500, restaurant_cents: 22000, rain_light_cents: 26000, rain_heavy_cents: 30000 },
  { min_km: 14.1, max_km: 15, repa_cents: 16500, mexy_cents: 7500, restaurant_cents: 24000, rain_light_cents: 28000, rain_heavy_cents: 32000 },
  { min_km: 15.1, max_km: 16, repa_cents: 17500, mexy_cents: 8500, restaurant_cents: 26000, rain_light_cents: 30000, rain_heavy_cents: 34000 },
  { min_km: 16.1, max_km: 17, repa_cents: 18500, mexy_cents: 9500, restaurant_cents: 28000, rain_light_cents: 32000, rain_heavy_cents: 36000 },
  { min_km: 17.1, max_km: 18, repa_cents: 19500, mexy_cents: 10500, restaurant_cents: 30000, rain_light_cents: 34000, rain_heavy_cents: 38000 },
  { min_km: 18.1, max_km: 19, repa_cents: 20500, mexy_cents: 11500, restaurant_cents: 32000, rain_light_cents: 36000, rain_heavy_cents: 40000 },
  { min_km: 19.1, max_km: 20, repa_cents: 21500, mexy_cents: 12500, restaurant_cents: 34000, rain_light_cents: 38000, rain_heavy_cents: 42000 },
];

export function createDefaultPricingConfig(): DeliveryProviderPricingConfig {
  return {
    inside_polygon: {
      day_cents: 3500,
      night_cents: 5000,
    },
    outside_polygon: {
      max_distance_km: 20,
      brackets: DEFAULT_OUTSIDE_BRACKETS.map((row) => ({ ...row })),
    },
  };
}

export function formatKmLabel(minKm: number, maxKm: number): string {
  if (minKm === 0) return `0 – ${maxKm} km`;
  return `${minKm} – ${maxKm} km`;
}

export function centsToPesosInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function pesosInputToCents(value: string): number {
  const parsed = Number.parseFloat(value.replace(/,/g, '').trim());
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(cents / 100);
}

export function parseKmInput(value: string): number {
  const parsed = Number.parseFloat(value.replace(/,/g, '').trim());
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 10) / 10;
}

export function createNextBracket(brackets: OutsideTariffBracket[]): OutsideTariffBracket {
  const last = brackets[brackets.length - 1];
  if (!last) {
    return {
      min_km: 0,
      max_km: 3,
      repa_cents: 4500,
      mexy_cents: 0,
      restaurant_cents: 4500,
      rain_light_cents: 6500,
      rain_heavy_cents: 9500,
    };
  }

  const span = Math.max(last.max_km - last.min_km, 1);
  const minKm = Math.round((last.max_km + 0.1) * 10) / 10;
  const maxKm = Math.round((last.max_km + span) * 10) / 10;

  return {
    min_km: minKm,
    max_km: maxKm,
    repa_cents: last.repa_cents,
    mexy_cents: last.mexy_cents,
    restaurant_cents: last.restaurant_cents,
    rain_light_cents: last.rain_light_cents,
    rain_heavy_cents: last.rain_heavy_cents,
  };
}

export function maxBracketKm(brackets: OutsideTariffBracket[]): number {
  if (brackets.length === 0) return 0;
  return Math.max(...brackets.map((row) => row.max_km));
}

export function validateBracketsClient(brackets: OutsideTariffBracket[], maxDistanceKm: number): string | null {
  if (brackets.length === 0) return 'Agrega al menos un tramo de distancia.';

  const highest = maxBracketKm(brackets);
  if (highest > maxDistanceKm) {
    return `La distancia máxima (${maxDistanceKm} km) debe cubrir el último tramo (${highest} km).`;
  }

  for (let index = 0; index < brackets.length; index += 1) {
    const row = brackets[index]!;
    if (row.max_km <= row.min_km) {
      return `Tramo ${index + 1}: el km final debe ser mayor al inicial.`;
    }
  }

  return null;
}

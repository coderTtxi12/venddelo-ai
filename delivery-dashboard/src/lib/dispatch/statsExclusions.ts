import { phoneDigits } from '../phone/phoneDigits';

export const STATS_EXCLUSIONS_KEY = 'mexy-stats-exclusions-v1';

export type StatsExclusions = {
  restaurantIds: string[];
  driverIds: string[];
  phones: string[];
};

export function normalizeStatsPhone(raw: string): string {
  return phoneDigits(raw);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
  }
  return next;
}

export function emptyStatsExclusions(): StatsExclusions {
  return { restaurantIds: [], driverIds: [], phones: [] };
}

export function parseStoredExclusions(raw: string | null | undefined): StatsExclusions {
  if (!raw) return emptyStatsExclusions();
  try {
    const parsed = JSON.parse(raw) as Partial<StatsExclusions>;
    return {
      restaurantIds: unique(
        Array.isArray(parsed.restaurantIds) ? parsed.restaurantIds.map(String) : [],
      ),
      driverIds: unique(Array.isArray(parsed.driverIds) ? parsed.driverIds.map(String) : []),
      phones: unique(
        Array.isArray(parsed.phones)
          ? parsed.phones.map((phone) => normalizeStatsPhone(String(phone))).filter(Boolean)
          : [],
      ),
    };
  } catch {
    return emptyStatsExclusions();
  }
}

export function serializeStatsExclusions(value: StatsExclusions): string {
  return JSON.stringify({
    restaurantIds: unique(value.restaurantIds),
    driverIds: unique(value.driverIds),
    phones: unique(value.phones.map(normalizeStatsPhone).filter(Boolean)),
  });
}

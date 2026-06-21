import type { PublicPromotionsContext } from '@/lib/api/public';

const STORAGE_PREFIX = 'venddelo:public-promotions:';

type CachedPromotionsPayload = PublicPromotionsContext & {
  cached_at: number;
};

export function promotionsCacheKey(subdomain: string): string {
  return `${STORAGE_PREFIX}${subdomain}`;
}

export function readPromotionsCache(subdomain: string): PublicPromotionsContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(promotionsCacheKey(subdomain));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedPromotionsPayload;
    if (!parsed || !Array.isArray(parsed.items)) return null;

    return {
      server_now: parsed.server_now,
      timezone: parsed.timezone,
      local_now: parsed.local_now,
      items: parsed.items,
    };
  } catch {
    return null;
  }
}

export function writePromotionsCache(subdomain: string, context: PublicPromotionsContext): void {
  if (typeof window === 'undefined') return;

  try {
    const payload: CachedPromotionsPayload = {
      ...context,
      cached_at: Date.now(),
    };
    window.localStorage.setItem(promotionsCacheKey(subdomain), JSON.stringify(payload));
  } catch {
    // Quota exceeded or private browsing — ignore silently.
  }
}

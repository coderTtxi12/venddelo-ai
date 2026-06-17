import type { PublicMenuCart } from './types';

const STORAGE_PREFIX = 'venddelo:public-cart:';

export function cartStorageKey(subdomain: string): string {
  return `${STORAGE_PREFIX}${subdomain}`;
}

export function readCartFromStorage(subdomain: string): PublicMenuCart | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(cartStorageKey(subdomain));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PublicMenuCart;
    if (!parsed || !Array.isArray(parsed.lines)) return null;

    return {
      lines: parsed.lines,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeCartToStorage(subdomain: string, cart: PublicMenuCart): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(cartStorageKey(subdomain), JSON.stringify(cart));
  } catch {
    // Quota exceeded or private browsing — ignore silently.
  }
}

export function clearCartStorage(subdomain: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(cartStorageKey(subdomain));
}

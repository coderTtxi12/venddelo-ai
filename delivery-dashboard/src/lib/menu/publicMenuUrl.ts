const MENU_PUBLIC_DOMAIN =
  process.env.NEXT_PUBLIC_MENU_PUBLIC_DOMAIN ?? 'mxy.mx';

function menuAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mxy.mx';
  try {
    return new URL(configured).origin;
  } catch {
    return 'https://mxy.mx';
  }
}

function usesPathRouting(): boolean {
  return (
    process.env.NEXT_PUBLIC_MENU_USE_PATH === 'true' ||
    MENU_PUBLIC_DOMAIN.endsWith('.vercel.app')
  );
}

/** Customer-facing digital menu URL. Independent of the courier web-app flag. */
export function restaurantPublicMenuUrl(subdomain: string): string | null {
  const tenant = subdomain.trim().toLowerCase();
  if (!tenant) return null;

  if (usesPathRouting()) {
    return `${menuAppOrigin()}/menu/${encodeURIComponent(tenant)}`;
  }

  return `https://${tenant}.${MENU_PUBLIC_DOMAIN}`;
}

export function restaurantPublicMenuLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.host}${path}`;
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
}

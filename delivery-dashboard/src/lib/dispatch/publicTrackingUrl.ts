const MENU_PUBLIC_DOMAIN =
  process.env.NEXT_PUBLIC_MENU_PUBLIC_DOMAIN ?? 'mxy.mx';

function menuAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  try {
    return new URL(configured).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

function trackingOrigin(subdomain?: string | null): string {
  if (process.env.NEXT_PUBLIC_MENU_USE_PATH === 'true' || MENU_PUBLIC_DOMAIN.endsWith('.vercel.app')) {
    return menuAppOrigin();
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return menuAppOrigin();
    }
  }
  const tenant = subdomain?.trim();
  if (tenant) {
    return `https://${tenant}.${MENU_PUBLIC_DOMAIN}`;
  }
  return menuAppOrigin();
}

export function publicTrackingUrl(
  token?: string | null,
  subdomain?: string | null,
): string | null {
  const value = token?.trim();
  if (!value) return null;
  return `${trackingOrigin(subdomain)}/rastreo/${encodeURIComponent(value)}`;
}

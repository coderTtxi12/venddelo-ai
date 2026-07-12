export const SUBDOMAIN_MIN_LENGTH = 3;
export const SUBDOMAIN_MAX_LENGTH = 63;
export const SUBDOMAIN_PATTERN = /^[a-z0-9](-?[a-z0-9])*$/;

export const MENU_PUBLIC_DOMAIN =
  process.env.NEXT_PUBLIC_MENU_PUBLIC_DOMAIN ?? 'mxy.mx';

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1']);

export function normalizeSubdomainInput(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/** Live input normalization — keeps a trailing hyphen while the user is still typing. */
export function normalizeSubdomainDraft(raw: string): string {
  const trimmed = raw.toLowerCase().trim();
  const preserveTrailingHyphen = trimmed.endsWith('-');

  const core = trimmed
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

  if (preserveTrailingHyphen && core.length > 0) {
    return `${core}-`;
  }

  return core;
}

export function validateSubdomain(subdomain: string): string | null {
  if (subdomain.length < SUBDOMAIN_MIN_LENGTH) {
    return `Usa al menos ${SUBDOMAIN_MIN_LENGTH} caracteres.`;
  }
  if (subdomain.length > SUBDOMAIN_MAX_LENGTH) {
    return `Máximo ${SUBDOMAIN_MAX_LENGTH} caracteres.`;
  }
  if (!SUBDOMAIN_PATTERN.test(subdomain)) {
    return 'Solo letras minúsculas, números y guiones (sin espacios).';
  }
  return null;
}

/** Extracts menu tenant subdomain from Host header (e.g. wild-rooster.localhost). */
export function extractMenuSubdomainFromHost(host: string): string | null {
  const hostname = host.split(':')[0]?.toLowerCase() ?? '';

  if (hostname.endsWith('.localhost') && hostname !== 'localhost') {
    const subdomain = hostname.slice(0, -'.localhost'.length);
    return subdomain && !subdomain.includes('.') ? subdomain : null;
  }

  if (
    hostname.endsWith(`.${MENU_PUBLIC_DOMAIN}`) &&
    hostname !== MENU_PUBLIC_DOMAIN &&
    hostname !== `www.${MENU_PUBLIC_DOMAIN}`
  ) {
    const subdomain = hostname.slice(0, -(MENU_PUBLIC_DOMAIN.length + 1));
    return subdomain && !subdomain.includes('.') ? subdomain : null;
  }

  return null;
}

export function isMenuPublicHost(host: string): boolean {
  return extractMenuSubdomainFromHost(host) != null;
}

function menuAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  try {
    return new URL(configured).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

/** Vercel deployment URLs (*.vercel.app) do not support tenant subdomains like wild-rooster.app.vercel.app. */
export function shouldUseMenuPathRouting(): boolean {
  if (process.env.NEXT_PUBLIC_MENU_USE_PATH === 'true') return true;
  return MENU_PUBLIC_DOMAIN.endsWith('.vercel.app');
}

function buildLocalSubdomainUrl(subdomain: string, origin?: string): string {
  const base = origin ?? menuAppBaseUrl();
  const url = new URL(base);
  const portSuffix = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${subdomain}.localhost${portSuffix}`;
}

export function restaurantPublicMenuPath(subdomain: string): string {
  return `/menu/${encodeURIComponent(subdomain)}`;
}

export function restaurantPublicMenuUrl(subdomain: string): string {
  if (shouldUseMenuPathRouting()) {
    return `${menuAppBaseUrl()}${restaurantPublicMenuPath(subdomain)}`;
  }

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (LOCALHOST_HOSTS.has(hostname)) {
      return buildLocalSubdomainUrl(subdomain, origin);
    }
  }

  if (process.env.NODE_ENV === 'development') {
    return buildLocalSubdomainUrl(subdomain);
  }

  return `https://${subdomain}.${MENU_PUBLIC_DOMAIN}`;
}

export function subdomainAvailabilityMessage(result: {
  available: boolean;
  valid: boolean;
  message: string | null;
}): string | null {
  if (result.available) return null;
  if (!result.valid) {
    return result.message ?? 'Formato de subdominio inválido.';
  }
  return 'Este subdominio ya está en uso. Elige otro.';
}

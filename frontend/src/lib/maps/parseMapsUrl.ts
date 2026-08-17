const AT_COORDINATES = /\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const DATA_COORDINATES = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const ALT_DATA_COORDINATES = /!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/;
const SEARCH_PATH_COORDINATES = /\/search\/([^/?#]+),([^/?#]+)/;
const Q_COORDINATES = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;

function parseCoordFragment(raw: string): number | null {
  const token = raw.trim().replace(/\+/g, '');
  if (!token) return null;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

function coordsFromPair(latRaw: string, lngRaw: string): { latitude: number; longitude: number } | null {
  const latitude = parseCoordFragment(latRaw);
  const longitude = parseCoordFragment(lngRaw);
  if (latitude == null || longitude == null) return null;
  if (!validCoordinates(latitude, longitude)) return null;
  return { latitude, longitude };
}

function validCoordinates(latitude: number, longitude: number): boolean {
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function matchCoordinates(text: string): { latitude: number; longitude: number } | null {
  for (const pattern of [AT_COORDINATES, DATA_COORDINATES, ALT_DATA_COORDINATES]) {
    const match = pattern.exec(text);
    if (!match) continue;
    const pair = coordsFromPair(match[1], match[2]);
    if (pair) return pair;
  }

  const searchMatch = SEARCH_PATH_COORDINATES.exec(text);
  if (searchMatch) {
    const pair = coordsFromPair(searchMatch[1], searchMatch[2]);
    if (pair) return pair;
  }

  return null;
}

/** Prepends https:// when users paste links without a scheme. */
export function normalizeMapsUrlInput(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (
    trimmed.startsWith('maps.app.goo.gl/') ||
    trimmed.startsWith('goo.gl/') ||
    trimmed.startsWith('www.google.') ||
    trimmed.startsWith('google.') ||
    trimmed.startsWith('maps.google.com/')
  ) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function looksLikeMapsUrl(text: string): boolean {
  const normalized = normalizeMapsUrlInput(text);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    return (
      host.includes('google.') ||
      host === 'maps.app.goo.gl' ||
      host === 'goo.gl' ||
      host === 'maps.google.com'
    );
  } catch {
    return false;
  }
}

/** Extract coordinates from common Google Maps URL formats without network I/O. */
export function parseMapsUrl(url: string): { latitude: number; longitude: number } | null {
  const normalized = normalizeMapsUrlInput(url);
  if (!normalized) return null;

  const fromFullUrl = matchCoordinates(normalized);
  if (fromFullUrl) return fromFullUrl;

  try {
    const parsed = new URL(normalized);
    const haystack = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const fromParts = matchCoordinates(haystack);
    if (fromParts) return fromParts;

    const ll = parsed.searchParams.get('ll');
    if (ll) {
      const [latRaw, lngRaw] = ll.split(',', 2);
      const latitude = Number(latRaw);
      const longitude = Number(lngRaw);
      if (validCoordinates(latitude, longitude)) {
        return { latitude, longitude };
      }
    }

    for (const key of ['q', 'query', 'destination', 'origin', 'center']) {
      const value = parsed.searchParams.get(key);
      if (!value || !Q_COORDINATES.test(value.trim())) continue;
      const [latRaw, lngRaw] = value.trim().split(',', 2);
      const pair = coordsFromPair(latRaw, lngRaw);
      if (pair) return pair;
    }
  } catch {
    return null;
  }

  return null;
}

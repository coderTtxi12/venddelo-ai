const AT_COORDINATES = /\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const DATA_COORDINATES = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const ALT_DATA_COORDINATES = /!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/;
const SEARCH_PATH_COORDINATES = /\/search\/([^/?#]+),([^/?#]+)/;
const Q_COORDINATES = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;
const PLACE_PATH = /\/maps\/place\/([^/@]+)/i;
const PASTED_COORDINATES =
  /^\s*(?:(?:lat(?:itud(?:e)?)?)\s*[:=]\s*)?(-?\d+(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;\s]\s*(?:(?:lng|lon(?:gitud(?:e)?)?)\s*[:=]\s*)?(-?\d+(?:\.\d+)?)\s*°?\s*([EWew])?\s*$/i;

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

function lastPatternCoords(
  text: string,
  pattern: RegExp,
): { latitude: number; longitude: number } | null {
  const matches = [...text.matchAll(new RegExp(pattern, 'g'))];
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i];
    const pair = coordsFromPair(match[1], match[2]);
    if (pair) return pair;
  }
  return null;
}

function matchPinCoordinates(text: string): { latitude: number; longitude: number } | null {
  const pin = lastPatternCoords(text, DATA_COORDINATES);
  if (pin) return pin;

  const searchMatch = SEARCH_PATH_COORDINATES.exec(text);
  if (searchMatch) {
    const pair = coordsFromPair(searchMatch[1], searchMatch[2]);
    if (pair) return pair;
  }

  return lastPatternCoords(text, ALT_DATA_COORDINATES);
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

export function parsePastedCoordinates(
  text: string,
): { latitude: number; longitude: number } | null {
  const trimmed = text.trim();
  if (!trimmed || /:\/\//.test(trimmed) || looksLikeMapsUrl(trimmed)) return null;
  const match = PASTED_COORDINATES.exec(trimmed);
  if (!match) return null;
  let latitude = Number(match[1]);
  let longitude = Number(match[3]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const latHem = (match[2] || '').toUpperCase();
  const lngHem = (match[4] || '').toUpperCase();
  if (latHem === 'S') latitude = -Math.abs(latitude);
  else if (latHem === 'N') latitude = Math.abs(latitude);
  if (lngHem === 'W') longitude = -Math.abs(longitude);
  else if (lngHem === 'E') longitude = Math.abs(longitude);
  if (!validCoordinates(latitude, longitude)) return null;
  return { latitude, longitude };
}

export function looksLikeCoordinates(text: string): boolean {
  return parsePastedCoordinates(text) != null;
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

function usableGeocodeText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text || Q_COORDINATES.test(text)) return null;
  if (text.toLowerCase().startsWith('place_id:')) return null;
  return text;
}

/** Place/address text from a Maps URL. Camera-only links return null. */
export function extractMapsQueryText(url: string): string | null {
  const normalized = normalizeMapsUrlInput(url);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    for (const key of ['q', 'query', 'destination']) {
      const text = usableGeocodeText(parsed.searchParams.get(key));
      if (text) return text;
    }
    const placeMatch = PLACE_PATH.exec(parsed.pathname);
    if (placeMatch) {
      return usableGeocodeText(decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')));
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Extract the shared pin (or explicit destination) from a Maps URL.
 * Ignores /@ camera center so place links fall through to the backend.
 */
export function parseMapsUrl(url: string): { latitude: number; longitude: number } | null {
  const normalized = normalizeMapsUrlInput(url);
  if (!normalized) return null;

  const fromFullUrl = matchPinCoordinates(normalized);
  if (fromFullUrl) return fromFullUrl;

  try {
    const parsed = new URL(normalized);
    const haystack = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const fromParts = matchPinCoordinates(haystack);
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

    for (const key of ['q', 'query', 'destination']) {
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

export function extractMapsCameraCoordinates(
  url: string,
): { latitude: number; longitude: number } | null {
  const normalized = normalizeMapsUrlInput(url);
  if (!normalized) return null;
  return lastPatternCoords(normalized, AT_COORDINATES);
}

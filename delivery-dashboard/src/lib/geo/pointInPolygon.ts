import type { GeoJsonPolygon } from '@/lib/onboarding/types';

/**
 * Ray-casting test for a point against a GeoJSON polygon ring (EPSG:4326).
 * Returns false when the polygon is missing or not closed with at least 3 vertices.
 */
export function isPointInGeoJsonPolygon(
  latitude: number,
  longitude: number,
  polygon: GeoJsonPolygon | null | undefined,
): boolean {
  const ring = polygon?.coordinates?.[0];
  if (!ring || ring.length < 4) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersects =
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

export type CoordinateValidationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; message: string };

function parseCoordinateValues(latText: string, lngText: string): CoordinateValidationResult {
  const latitude = Number(latText.replace(',', '.'));
  const longitude = Number(lngText.replace(',', '.'));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, message: 'Las coordenadas deben ser números válidos.' };
  }

  if (latitude < -90 || latitude > 90) {
    return { ok: false, message: 'La latitud debe estar entre -90 y 90.' };
  }

  if (longitude < -180 || longitude > 180) {
    return { ok: false, message: 'La longitud debe estar entre -180 y 180.' };
  }

  return { ok: true, latitude, longitude };
}

export function parseCoordinateInput(input: string): CoordinateValidationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, message: 'Ingresa las coordenadas.' };
  }

  const commaParts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (commaParts.length === 2) {
    return parseCoordinateValues(commaParts[0], commaParts[1]);
  }

  const spaceParts = trimmed.split(/\s+/).filter(Boolean);
  if (spaceParts.length === 2) {
    return parseCoordinateValues(spaceParts[0], spaceParts[1]);
  }

  return {
    ok: false,
    message: 'Usa el formato latitud, longitud (ej. 19.432600, -99.133200).',
  };
}

export function parseCoordinatePair(
  latitudeInput: string,
  longitudeInput: string,
): CoordinateValidationResult {
  const latText = latitudeInput.trim();
  const lngText = longitudeInput.trim();

  if (!latText || !lngText) {
    return { ok: false, message: 'Ingresa latitud y longitud.' };
  }

  return parseCoordinateValues(latText, lngText);
}

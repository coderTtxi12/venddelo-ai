import type { Restaurant } from '@/lib/api/types';

type LocationFields = Pick<Restaurant, 'address' | 'latitude' | 'longitude' | 'place_id' | 'name'>;

function mapsApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
}

type StaticMapOptions = {
  width?: number;
  height?: number;
  scale?: 1 | 2;
  zoom?: number;
};

export function buildGoogleMapsStaticUrl(
  restaurant: LocationFields,
  options: StaticMapOptions = {},
): string | null {
  const apiKey = mapsApiKey();
  if (!apiKey) return null;

  const width = Math.min(Math.max(options.width ?? 600, 1), 640);
  const height = Math.min(Math.max(options.height ?? 168, 1), 640);
  const scale = options.scale ?? 2;
  const zoom = options.zoom ?? 16;

  let center: string | null = null;
  let marker: string | null = null;

  if (restaurant.latitude != null && restaurant.longitude != null) {
    center = `${restaurant.latitude},${restaurant.longitude}`;
    marker = `color:0xea4335|${center}`;
  } else {
    const address = restaurant.address?.trim();
    if (!address) return null;
    center = address;
    marker = `color:0xea4335|${address}`;
  }

  const params = new URLSearchParams({
    center,
    zoom: String(zoom),
    size: `${width}x${height}`,
    scale: String(scale),
    markers: marker,
    key: apiKey,
    language: 'es',
  });

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export function buildGoogleMapsEmbedUrl(restaurant: LocationFields): string | null {
  const apiKey = mapsApiKey();

  // Prefer exact coordinates (e.g. after pin drag in settings) — place mode shows a map pin.
  if (restaurant.latitude != null && restaurant.longitude != null) {
    const coords = `${restaurant.latitude},${restaurant.longitude}`;
    if (apiKey) {
      return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(coords)}&zoom=17&language=es`;
    }
    return `https://maps.google.com/maps?q=${encodeURIComponent(coords)}&hl=es&z=17&output=embed`;
  }

  if (restaurant.place_id && apiKey) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=place_id:${encodeURIComponent(restaurant.place_id)}&language=es`;
  }

  const address = restaurant.address?.trim();
  if (!address) return null;

  if (apiKey) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(address)}&language=es`;
  }

  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&hl=es&z=16&output=embed`;
}

export function buildGoogleMapsLink(restaurant: LocationFields): string | null {
  if (restaurant.latitude != null && restaurant.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${restaurant.latitude},${restaurant.longitude}`;
  }

  if (restaurant.place_id) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`place_id:${restaurant.place_id}`)}`;
  }

  const address = restaurant.address?.trim();
  if (!address) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function hasRestaurantLocation(restaurant: LocationFields): boolean {
  return (
    Boolean(restaurant.address?.trim()) ||
    (restaurant.latitude != null && restaurant.longitude != null) ||
    Boolean(restaurant.place_id)
  );
}

/** Full float64 precision for display (matches Postgres float8 / API JSON). */
export function formatGeoCoordinate(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toFixed(15).replace(/\.?0+$/, '');
}

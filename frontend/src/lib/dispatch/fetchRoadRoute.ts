export type RoadRoutePoint = {
  lat: number;
  lng: number;
};

const cache = new Map<string, Promise<RoadRoutePoint[] | null>>();

function quantize(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function cacheKey(origin: RoadRoutePoint, destination: RoadRoutePoint): string {
  return [
    quantize(origin.lat),
    quantize(origin.lng),
    quantize(destination.lat),
    quantize(destination.lng),
  ].join(',');
}

function travelModes(): string[] {
  const twoWheeler = google.maps.TravelMode?.TWO_WHEELER;
  if (twoWheeler) return [twoWheeler, google.maps.TravelMode.DRIVING];
  return [google.maps.TravelMode.DRIVING];
}

async function requestRoute(
  origin: RoadRoutePoint,
  destination: RoadRoutePoint,
  travelMode: string,
): Promise<RoadRoutePoint[] | null> {
  const service = new google.maps.DirectionsService();
  try {
    const result = await service.route({
      origin,
      destination,
      travelMode,
    });
    const path = result.routes[0]?.overview_path ?? [];
    if (path.length < 2) return null;
    return path.map((point) => ({ lat: point.lat(), lng: point.lng() }));
  } catch {
    return null;
  }
}

export function fetchRoadRoute(
  origin: RoadRoutePoint,
  destination: RoadRoutePoint,
): Promise<RoadRoutePoint[] | null> {
  const key = cacheKey(origin, destination);
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    for (const mode of travelModes()) {
      const path = await requestRoute(origin, destination, mode);
      if (path) return path;
    }
    return null;
  })();

  cache.set(key, pending);
  return pending;
}

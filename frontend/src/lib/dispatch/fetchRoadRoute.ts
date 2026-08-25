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

async function requestRoute(
  origin: RoadRoutePoint,
  destination: RoadRoutePoint,
): Promise<RoadRoutePoint[] | null> {
  const service = new google.maps.DirectionsService();
  try {
    const result = await service.route({
      origin,
      destination,
      // DRIVING only: TWO_WHEELER bills as Routes Compute Routes Enterprise.
      travelMode: google.maps.TravelMode.DRIVING,
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

  const pending = requestRoute(origin, destination);

  cache.set(key, pending);
  return pending;
}

const stablePaths = new Map<string, Promise<RoadRoutePoint[]>>();

/** Fetch a road once per cacheKey. Later GPS updates reuse the same polyline. */
export function fetchStableRoadPath(
  cacheKey: string,
  origin: RoadRoutePoint,
  destination: RoadRoutePoint,
): Promise<RoadRoutePoint[]> {
  const cached = stablePaths.get(cacheKey);
  if (cached) return cached;

  const pending = fetchRoadRoute(origin, destination).then((road) =>
    road && road.length > 1 ? road : [origin, destination],
  );
  stablePaths.set(cacheKey, pending);
  return pending;
}

export type MonitorRoadPoint = {
  lat: number;
  lng: number;
};

const METERS_PER_DEGREE_LAT = 111_320;
const DASH_SEGMENT_METERS = 70;

function approximateMeters(origin: MonitorRoadPoint, destination: MonitorRoadPoint): number {
  const latMeters = (destination.lat - origin.lat) * METERS_PER_DEGREE_LAT;
  const lngMeters =
    (destination.lng - origin.lng) *
    METERS_PER_DEGREE_LAT *
    Math.cos((origin.lat * Math.PI) / 180);
  return Math.hypot(latMeters, lngMeters);
}

/** Extra vertices so Google Maps symbol dashes render on a straight geodesic. */
export function densifyStraightPath(
  origin: MonitorRoadPoint,
  destination: MonitorRoadPoint,
  maxSegmentMeters = DASH_SEGMENT_METERS,
): MonitorRoadPoint[] {
  const distance = approximateMeters(origin, destination);
  if (distance <= maxSegmentMeters) return [origin, destination];
  const steps = Math.min(80, Math.max(2, Math.ceil(distance / maxSegmentMeters)));
  const points: MonitorRoadPoint[] = [origin];
  for (let index = 1; index < steps; index += 1) {
    const t = index / steps;
    points.push({
      lat: origin.lat + (destination.lat - origin.lat) * t,
      lng: origin.lng + (destination.lng - origin.lng) * t,
    });
  }
  points.push(destination);
  return points;
}

export async function resolveMonitorRoadPath(options: {
  requestId: string;
  focusedRequestId: string | null | undefined;
  origin: MonitorRoadPoint;
  destination: MonitorRoadPoint;
  loadRoad: () => Promise<MonitorRoadPoint[] | null>;
}): Promise<MonitorRoadPoint[]> {
  const straight = densifyStraightPath(options.origin, options.destination);
  if (!options.focusedRequestId || options.focusedRequestId !== options.requestId) {
    return straight;
  }
  const road = await options.loadRoad();
  return road && road.length > 1 ? road : straight;
}

export function isMonitorPolylineVisible(
  requestId: string,
  focusedRequestId: string | null | undefined,
): boolean {
  if (!focusedRequestId) return true;
  return requestId === focusedRequestId;
}

export type MonitorOverviewRoute = {
  request_id: string;
  driver_id: string;
};

export type MonitorOverviewItineraryStop = {
  sequence: number;
  request_id: string;
  current?: boolean;
};

export type MonitorOverviewDriver = {
  id: string;
  itinerary?: MonitorOverviewItineraryStop[] | null;
};

export function driverCurrentRequestId(driver: MonitorOverviewDriver): string | null {
  const stops = driver.itinerary ?? [];
  const current =
    stops.find((stop) => stop.current) ?? stops.find((stop) => stop.sequence === 1);
  return current?.request_id ?? null;
}

export function isDriverCurrentRequest(
  driver: MonitorOverviewDriver | undefined,
  requestId: string,
): boolean {
  if (!driver) return true;
  const currentId = driverCurrentRequestId(driver);
  if (!currentId) return true;
  return currentId === requestId;
}

/** Overview (nothing focused): one straight line per rider, to their current stop. */
export function monitorOverviewRoutes<T extends MonitorOverviewRoute>(
  routes: T[],
  drivers: MonitorOverviewDriver[],
): T[] {
  const currentByDriver = new Map<string, string>();
  for (const driver of drivers) {
    const currentId = driverCurrentRequestId(driver);
    if (currentId) currentByDriver.set(driver.id, currentId);
  }
  return routes.filter((route) => {
    const currentRequestId = currentByDriver.get(route.driver_id);
    if (!currentRequestId) return true;
    return route.request_id === currentRequestId;
  });
}

const BUSINESS_SPOKE_STATUSES = new Set([
  'scheduled',
  'searching',
  'offered',
  'unassigned',
  'assigned',
  'picked_up',
  'in_transit',
]);

export type MonitorRestaurantSpokeRequest = {
  id: string;
  status: string;
  restaurant_id?: string | null;
  restaurant_lat: number | null;
  restaurant_lng: number | null;
  dropoff_lat: number;
  dropoff_lng: number;
  assigned_driver_id?: string | null;
};

export type MonitorRestaurantSpoke = {
  requestId: string;
  origin: MonitorRoadPoint;
  destination: MonitorRoadPoint;
};

export function monitorRestaurantSpokes(
  requests: MonitorRestaurantSpokeRequest[],
  focusedRestaurantId: string | null | undefined,
): MonitorRestaurantSpoke[] {
  if (!focusedRestaurantId) return [];
  const spokes: MonitorRestaurantSpoke[] = [];
  for (const request of requests) {
    if (request.restaurant_id !== focusedRestaurantId) continue;
    if (!BUSINESS_SPOKE_STATUSES.has(request.status)) continue;
    if (request.restaurant_lat == null || request.restaurant_lng == null) continue;
    spokes.push({
      requestId: request.id,
      origin: { lat: request.restaurant_lat, lng: request.restaurant_lng },
      destination: { lat: request.dropoff_lat, lng: request.dropoff_lng },
    });
  }
  return spokes;
}

export type MonitorRestaurantRiderRequest = MonitorRestaurantSpokeRequest & {
  assigned_driver_id: string | null;
};

export type MonitorRestaurantRiderLocation = MonitorOverviewDriver & {
  last_lat: number | null;
  last_lng: number | null;
};

export function monitorRestaurantRiderLegs(
  requests: MonitorRestaurantRiderRequest[],
  drivers: MonitorRestaurantRiderLocation[],
  focusedRestaurantId: string | null | undefined,
): MonitorRestaurantSpoke[] {
  if (!focusedRestaurantId) return [];
  const byId = new Map(drivers.map((driver) => [driver.id, driver]));
  const legs: MonitorRestaurantSpoke[] = [];
  for (const request of requests) {
    if (request.restaurant_id !== focusedRestaurantId) continue;
    if (!request.assigned_driver_id) continue;
    const driver = byId.get(request.assigned_driver_id);
    if (driver?.last_lat == null || driver.last_lng == null) continue;
    if (!isDriverCurrentRequest(driver, request.id)) continue;
    const rider = { lat: driver.last_lat, lng: driver.last_lng };
    if (request.status === 'assigned') {
      if (request.restaurant_lat == null || request.restaurant_lng == null) continue;
      legs.push({
        requestId: request.id,
        origin: rider,
        destination: { lat: request.restaurant_lat, lng: request.restaurant_lng },
      });
      continue;
    }
    if (request.status === 'picked_up' || request.status === 'in_transit') {
      legs.push({
        requestId: request.id,
        origin: rider,
        destination: { lat: request.dropoff_lat, lng: request.dropoff_lng },
      });
    }
  }
  return legs;
}



import type {
  DispatchMonitorDriver,
  DispatchMonitorRequest,
  DispatchMonitorSnapshot,
} from '@/lib/api/types';

const ACTIVE_STATUSES = new Set(['assigned', 'picked_up', 'in_transit']);

export type DriverItineraryStopKind = 'driver' | 'restaurant' | 'dropoff';

export type DriverItineraryStop = {
  id: string;
  kind: DriverItineraryStopKind;
  sequence: number | null;
  action: string;
  title: string;
  detail: string | null;
  lat: number;
  lng: number;
  requestId: string | null;
  shortId: string | null;
  current: boolean;
};

export type DriverItinerary = {
  driverId: string;
  driverName: string;
  plate: string;
  origin: DriverItineraryStop | null;
  stops: DriverItineraryStop[];
};

export type RiderJobSplit<T> = {
  current: T | null;
  queued: T[];
};

type Point = { lat: number; lng: number };

function coords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Point | null {
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return null;
  return { lat, lng };
}

function haversineMeters(a: Point, b: Point): number {
  const radius = 6371000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function caseApplied(request: DispatchMonitorRequest): string | null {
  return request.last_case ?? null;
}

function nearestOrder(
  items: DispatchMonitorRequest[],
  pointOf: (item: DispatchMonitorRequest) => Point | null,
  riderLat: number | null,
  riderLng: number | null,
): DispatchMonitorRequest[] {
  if (items.length <= 1) return [...items];
  const remaining = [...items];
  const ordered: DispatchMonitorRequest[] = [];
  let lat = riderLat;
  let lng = riderLng;
  while (remaining.length > 0) {
    let index = 0;
    let best = Number.POSITIVE_INFINITY;
    if (lat != null && lng != null) {
      const origin = { lat, lng };
      for (let i = 0; i < remaining.length; i += 1) {
        const point = pointOf(remaining[i]);
        if (!point) continue;
        const distance = haversineMeters(origin, point);
        if (distance < best) {
          best = distance;
          index = i;
        }
      }
    }
    const [chosen] = remaining.splice(index, 1);
    ordered.push(chosen);
    const next = pointOf(chosen);
    if (next) {
      lat = next.lat;
      lng = next.lng;
    }
  }
  return ordered;
}

/** Same job order as `splitRiderJobs` in the rider app. Not stored in DB. */
export function splitRiderJobs(
  assignments: DispatchMonitorRequest[],
  riderLat: number | null = null,
  riderLng: number | null = null,
): RiderJobSplit<DispatchMonitorRequest> {
  if (assignments.length === 0) {
    return { current: null, queued: [] };
  }

  const restaurantPoint = (item: DispatchMonitorRequest) =>
    coords(item.restaurant_lat, item.restaurant_lng);
  const dropoffPoint = (item: DispatchMonitorRequest) =>
    coords(item.dropoff_lat, item.dropoff_lng);

  const pickupNow = assignments.filter(
    (item) => item.status === 'assigned' && caseApplied(item) === 'D',
  );
  const inTransit = assignments.filter((item) => item.status === 'in_transit');
  const assigned = assignments.filter((item) => item.status === 'assigned');
  const pickedUp = assignments.filter((item) => item.status === 'picked_up');

  if (pickupNow.length > 0) {
    const orderedPickups = nearestOrder(pickupNow, restaurantPoint, riderLat, riderLng);
    return {
      current: orderedPickups[0],
      queued: [
        ...orderedPickups.slice(1),
        ...nearestOrder(inTransit, dropoffPoint, riderLat, riderLng),
        ...nearestOrder(
          assigned.filter((item) => caseApplied(item) !== 'D'),
          restaurantPoint,
          riderLat,
          riderLng,
        ),
        ...nearestOrder(pickedUp, dropoffPoint, riderLat, riderLng),
      ],
    };
  }

  if (inTransit.length > 0) {
    const orderedDeliveries = nearestOrder(inTransit, dropoffPoint, riderLat, riderLng);
    return {
      current: orderedDeliveries[0],
      queued: [
        ...orderedDeliveries.slice(1),
        ...nearestOrder(assigned, restaurantPoint, riderLat, riderLng),
        ...nearestOrder(pickedUp, dropoffPoint, riderLat, riderLng),
      ],
    };
  }

  if (assigned.length > 0) {
    const orderedPickups = nearestOrder(assigned, restaurantPoint, riderLat, riderLng);
    return {
      current: orderedPickups[0],
      queued: [
        ...orderedPickups.slice(1),
        ...nearestOrder(pickedUp, dropoffPoint, riderLat, riderLng),
      ],
    };
  }

  const ordered = nearestOrder(assignments, dropoffPoint, riderLat, riderLng);
  return { current: ordered[0], queued: ordered.slice(1) };
}

export function jobsForDriver(
  snapshot: DispatchMonitorSnapshot,
  driver: DispatchMonitorDriver,
): DispatchMonitorRequest[] {
  const assignments = snapshot.requests.filter(
    (request) =>
      request.assigned_driver_id === driver.id && ACTIVE_STATUSES.has(request.status),
  );
  const split = splitRiderJobs(assignments, driver.last_lat, driver.last_lng);
  return split.current ? [split.current, ...split.queued] : split.queued;
}

function pickupStop(
  request: DispatchMonitorRequest,
): Omit<DriverItineraryStop, 'sequence' | 'current'> | null {
  const restaurant = coords(request.restaurant_lat, request.restaurant_lng);
  if (!restaurant) return null;
  return {
    id: `restaurant:${request.id}`,
    kind: 'restaurant',
    action: 'Recoger',
    title: request.restaurant_name,
    detail: request.short_id,
    lat: restaurant.lat,
    lng: restaurant.lng,
    requestId: request.id,
    shortId: request.short_id,
  };
}

function dropoffStop(
  request: DispatchMonitorRequest,
): Omit<DriverItineraryStop, 'sequence' | 'current'> | null {
  const dropoff = coords(request.dropoff_lat, request.dropoff_lng);
  if (!dropoff) return null;
  return {
    id: `dropoff:${request.id}`,
    kind: 'dropoff',
    action: 'Entregar',
    title: request.customer_name || request.dropoff_address,
    detail: request.dropoff_address,
    lat: dropoff.lat,
    lng: dropoff.lng,
    requestId: request.id,
    shortId: request.short_id,
  };
}

/** Remaining stops in rider order, including later dropoffs of still-assigned jobs.
 * Example: in_transit A + assigned B → Entregar A, Recoger B, Entregar B.
 * Keep in sync with `riderItineraryStops` in apps/rider/lib/maps/nav_target.dart. */
export function expandItineraryStops(
  jobs: DispatchMonitorRequest[],
  riderLat: number | null,
  riderLng: number | null,
): DriverItineraryStop[] {
  const raw: Array<Omit<DriverItineraryStop, 'sequence' | 'current'>> = [];
  let lat = riderLat;
  let lng = riderLng;
  const pendingDeliveries: DispatchMonitorRequest[] = [];

  const push = (stop: Omit<DriverItineraryStop, 'sequence' | 'current'> | null) => {
    if (!stop) return;
    raw.push(stop);
    lat = stop.lat;
    lng = stop.lng;
  };

  for (const job of jobs) {
    if (job.status === 'assigned') {
      push(pickupStop(job));
      pendingDeliveries.push(job);
      continue;
    }
    push(dropoffStop(job));
  }

  for (const job of nearestOrder(
    pendingDeliveries,
    (item) => coords(item.dropoff_lat, item.dropoff_lng),
    lat,
    lng,
  )) {
    push(dropoffStop(job));
  }

  return raw.map((stop, index) => ({
    ...stop,
    sequence: index + 1,
    current: index === 0,
  }));
}

export function buildDriverItinerary(
  snapshot: DispatchMonitorSnapshot,
  driverId: string,
): DriverItinerary | null {
  const driver = snapshot.drivers.find((row) => row.id === driverId) ?? null;
  if (!driver) return null;

  const originPoint = coords(driver.last_lat, driver.last_lng);
  const origin = originPoint
    ? {
        id: `driver:${driver.id}`,
        kind: 'driver' as const,
        sequence: null,
        action: 'Ahora',
        title: `${driver.first_name} ${driver.last_name}`.trim(),
        detail: driver.plate,
        lat: originPoint.lat,
        lng: originPoint.lng,
        requestId: null,
        shortId: null,
        current: false,
      }
    : null;

  const jobs = jobsForDriver(snapshot, driver);
  const fromApi = stopsFromApi(driver);
  return {
    driverId: driver.id,
    driverName: `${driver.first_name} ${driver.last_name}`.trim(),
    plate: driver.plate,
    origin,
    stops: fromApi ?? expandItineraryStops(jobs, driver.last_lat, driver.last_lng),
  };
}

function stopsFromApi(driver: DispatchMonitorDriver): DriverItineraryStop[] | null {
  const rows = driver.itinerary ?? [];
  if (rows.length === 0) return null;
  const mapped: DriverItineraryStop[] = [];
  for (const row of rows) {
    if (row.lat == null || row.lng == null) continue;
    mapped.push({
      id: `${row.kind}:${row.request_id}`,
      kind: row.kind,
      sequence: row.sequence,
      action: row.action || (row.kind === 'restaurant' ? 'Recoger' : 'Entregar'),
      title: row.title || '',
      detail: row.detail ?? null,
      lat: row.lat,
      lng: row.lng,
      requestId: row.request_id,
      shortId: row.short_id ?? null,
      current: Boolean(row.current) || row.sequence === 1,
    });
  }
  return mapped.length === 0 ? null : mapped;
}

export function itineraryFitPoints(itinerary: DriverItinerary): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  if (itinerary.origin) {
    points.push({ lat: itinerary.origin.lat, lng: itinerary.origin.lng });
  }
  for (const stop of itinerary.stops) {
    points.push({ lat: stop.lat, lng: stop.lng });
  }
  return points;
}

export function itineraryLegs(itinerary: DriverItinerary): Array<{
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  current: boolean;
}> {
  const chain = itinerary.origin ? [itinerary.origin, ...itinerary.stops] : itinerary.stops;
  const legs: Array<{
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    current: boolean;
  }> = [];
  for (let index = 1; index < chain.length; index += 1) {
    const from = chain[index - 1];
    const to = chain[index];
    legs.push({
      from: { lat: from.lat, lng: from.lng },
      to: { lat: to.lat, lng: to.lng },
      current: index === 1,
    });
  }
  return legs;
}

export function pickupBeforeDropoff(
  stops: Array<{ kind: string; request_id?: string | null; requestId?: string | null }>,
): boolean {
  const pickupAt = new Map<string, number>();
  const dropoffAt = new Map<string, number>();
  stops.forEach((stop, index) => {
    const requestId = stop.request_id || stop.requestId || '';
    if (!requestId) return;
    if (stop.kind === 'restaurant') pickupAt.set(requestId, index);
    if (stop.kind === 'dropoff') dropoffAt.set(requestId, index);
  });
  for (const [requestId, dropIndex] of dropoffAt) {
    const pickIndex = pickupAt.get(requestId);
    if (pickIndex != null && pickIndex > dropIndex) return false;
  }
  return true;
}

export function stopSequence(
  itinerary: DriverItinerary | null,
  requestId: string,
  kind: 'restaurant' | 'dropoff',
): number | null {
  if (!itinerary) return null;
  return itinerary.stops.find((stop) => stop.requestId === requestId && stop.kind === kind)?.sequence ?? null;
}

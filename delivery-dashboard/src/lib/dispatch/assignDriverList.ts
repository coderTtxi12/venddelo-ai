import type { DispatchMonitorDriver } from '../api/types';

/** Keep in sync with backend `app.modules.delivery_dispatch.geo.geodesic_meters`. */
const EARTH_RADIUS_METERS = 6_371_000;

export type AssignDriverFilter = 'online' | 'available' | 'nearby' | 'all';

export const ASSIGN_DRIVER_FILTERS: { id: AssignDriverFilter; label: string }[] = [
  { id: 'online', label: 'En línea' },
  { id: 'available', label: 'Disponibles' },
  { id: 'nearby', label: 'Cercanía' },
  { id: 'all', label: 'Todos' },
];

export function isDriverAvailable(
  driver: Pick<DispatchMonitorDriver, 'is_online' | 'active_request_id' | 'occupied_job_count'>,
): boolean {
  return (
    driver.is_online &&
    !driver.active_request_id &&
    (driver.occupied_job_count ?? 0) === 0
  );
}

export function geodesicMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lng2 - lng1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function pickupDistanceMeters(
  driver: Pick<DispatchMonitorDriver, 'last_lat' | 'last_lng'>,
  restaurantLat: number | null | undefined,
  restaurantLng: number | null | undefined,
): number | null {
  if (
    driver.last_lat == null ||
    driver.last_lng == null ||
    restaurantLat == null ||
    restaurantLng == null
  ) {
    return null;
  }
  return geodesicMeters(driver.last_lat, driver.last_lng, restaurantLat, restaurantLng);
}

export function formatPickupDistance(meters: number | null): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function isAssignable(driver: DispatchMonitorDriver): boolean {
  return driver.status !== 'blocked';
}

function isEngineProximityCandidate(driver: DispatchMonitorDriver): boolean {
  return (
    isAssignable(driver) &&
    driver.status === 'active' &&
    driver.is_online &&
    !driver.location_stale &&
    driver.last_lat != null &&
    driver.last_lng != null
  );
}

function matchesFilter(
  driver: DispatchMonitorDriver,
  filter: AssignDriverFilter,
  restaurantLat: number | null | undefined,
  restaurantLng: number | null | undefined,
): boolean {
  if (!isAssignable(driver)) return false;
  if (filter === 'online') return driver.is_online;
  if (filter === 'available') return isDriverAvailable(driver);
  if (filter === 'nearby') {
    if (restaurantLat == null || restaurantLng == null) return false;
    return isEngineProximityCandidate(driver);
  }
  return true;
}

function byRestaurantDistance(
  restaurantLat: number | null | undefined,
  restaurantLng: number | null | undefined,
) {
  return (a: DispatchMonitorDriver, b: DispatchMonitorDriver): number => {
    const da = pickupDistanceMeters(a, restaurantLat, restaurantLng);
    const db = pickupDistanceMeters(b, restaurantLat, restaurantLng);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  };
}

export function filterAssignDrivers(
  drivers: DispatchMonitorDriver[],
  filter: AssignDriverFilter,
  restaurantLat: number | null | undefined,
  restaurantLng: number | null | undefined,
): DispatchMonitorDriver[] {
  return drivers
    .filter((driver) => matchesFilter(driver, filter, restaurantLat, restaurantLng))
    .sort(byRestaurantDistance(restaurantLat, restaurantLng));
}

export function assignDriverFilterCounts(
  drivers: DispatchMonitorDriver[],
  restaurantLat: number | null | undefined,
  restaurantLng: number | null | undefined,
): Record<AssignDriverFilter, number> {
  return {
    online: filterAssignDrivers(drivers, 'online', restaurantLat, restaurantLng).length,
    available: filterAssignDrivers(drivers, 'available', restaurantLat, restaurantLng).length,
    nearby: filterAssignDrivers(drivers, 'nearby', restaurantLat, restaurantLng).length,
    all: filterAssignDrivers(drivers, 'all', restaurantLat, restaurantLng).length,
  };
}

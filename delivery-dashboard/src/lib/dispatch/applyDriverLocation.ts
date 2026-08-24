import type { DispatchMonitorDriver, DispatchMonitorSnapshot } from '../api/types';

export type MonitorUpdatedEvent = { type: 'monitor.updated' };

export type DriverLocationEvent = {
  type: 'driver.location';
  driver_id: string;
  last_lat: number | null;
  last_lng: number | null;
  location_updated_at: string | null;
};

export type DispatchMonitorSocketEvent = MonitorUpdatedEvent | DriverLocationEvent;

const DEFAULT_STALE_AFTER_SECONDS = 90;

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseDispatchMonitorSocketEvent(raw: unknown): DispatchMonitorSocketEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = (raw as { type?: unknown }).type;
  if (type === 'monitor.updated') {
    return { type: 'monitor.updated' };
  }
  if (type !== 'driver.location') return null;
  const event = raw as Record<string, unknown>;
  if (typeof event.driver_id !== 'string' || event.driver_id.length === 0) {
    return null;
  }
  return {
    type: 'driver.location',
    driver_id: event.driver_id,
    last_lat: asFiniteNumber(event.last_lat),
    last_lng: asFiniteNumber(event.last_lng),
    location_updated_at:
      typeof event.location_updated_at === 'string' ? event.location_updated_at : null,
  };
}

export function driverLocationAgeSeconds(
  driver: Pick<DispatchMonitorDriver, 'location_updated_at' | 'location_age_seconds'>,
  nowMs: number,
): number | null {
  if (driver.location_updated_at) {
    const parsed = Date.parse(driver.location_updated_at);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor((nowMs - parsed) / 1000));
    }
  }
  return driver.location_age_seconds ?? null;
}

export function applyDriverLocationToSnapshot(
  snapshot: DispatchMonitorSnapshot,
  event: DriverLocationEvent,
  nowMs: number,
  staleAfterSeconds = DEFAULT_STALE_AFTER_SECONDS,
): DispatchMonitorSnapshot {
  let found = false;
  const drivers = snapshot.drivers.map((driver) => {
    if (driver.id !== event.driver_id) return driver;
    found = true;
    const next: DispatchMonitorDriver = {
      ...driver,
      last_lat: event.last_lat,
      last_lng: event.last_lng,
      location_updated_at: event.location_updated_at,
    };
    const age = driverLocationAgeSeconds(next, nowMs);
    const hasFix = event.last_lat != null && event.last_lng != null;
    return {
      ...next,
      location_age_seconds: age,
      location_stale: !hasFix || !driver.is_online || (age != null && age > staleAfterSeconds),
    };
  });
  if (!found) return snapshot;
  return {
    ...snapshot,
    drivers,
    metrics: {
      ...snapshot.metrics,
      drivers_location_stale: drivers.filter((row) => row.is_online && row.location_stale).length,
    },
  };
}

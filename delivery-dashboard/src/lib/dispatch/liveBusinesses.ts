import type { DispatchMonitorRequest } from '@/lib/api/types';

const QUEUE_STATUSES = new Set(['scheduled', 'searching', 'offered']);
const ACTIVE_STATUSES = new Set(['assigned', 'picked_up', 'in_transit']);

export type MonitorLiveBusiness = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  logoPath: string | null;
  lat: number | null;
  lng: number | null;
  zoneId: string | null;
  zoneName: string | null;
  queueCount: number;
  activeCount: number;
  unassignedCount: number;
  requests: DispatchMonitorRequest[];
};

export function liveBusinessesFromRequests(
  requests: DispatchMonitorRequest[],
): MonitorLiveBusiness[] {
  const byId = new Map<string, MonitorLiveBusiness>();
  for (const request of requests) {
    const id = request.restaurant_id;
    if (!id) continue;
    const existing = byId.get(id);
    if (existing) {
      existing.requests.push(request);
      if (QUEUE_STATUSES.has(request.status)) existing.queueCount += 1;
      else if (ACTIVE_STATUSES.has(request.status)) existing.activeCount += 1;
      else if (request.status === 'unassigned') existing.unassignedCount += 1;
      continue;
    }
    byId.set(id, {
      id,
      name: request.restaurant_name,
      address: request.restaurant_address ?? null,
      phone: request.restaurant_phone ?? null,
      logoPath: request.restaurant_logo_path ?? null,
      lat: request.restaurant_lat,
      lng: request.restaurant_lng,
      zoneId: request.zone_id ?? null,
      zoneName: request.zone_name ?? null,
      queueCount: QUEUE_STATUSES.has(request.status) ? 1 : 0,
      activeCount: ACTIVE_STATUSES.has(request.status) ? 1 : 0,
      unassignedCount: request.status === 'unassigned' ? 1 : 0,
      requests: [request],
    });
  }
  return [...byId.values()].sort((a, b) => {
    const liveA = a.queueCount + a.activeCount + a.unassignedCount;
    const liveB = b.queueCount + b.activeCount + b.unassignedCount;
    if (liveB !== liveA) return liveB - liveA;
    return a.name.localeCompare(b.name, 'es');
  });
}

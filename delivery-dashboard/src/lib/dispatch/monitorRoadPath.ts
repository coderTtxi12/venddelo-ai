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

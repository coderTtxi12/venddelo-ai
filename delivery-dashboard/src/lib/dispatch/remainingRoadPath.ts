export type RoadPoint = { lat: number; lng: number };

const METERS_PER_DEGREE_LAT = 111_320;

function toLocalMeters(point: RoadPoint, origin: RoadPoint): { x: number; y: number } {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lng - origin.lng) * metersPerDegreeLng,
    y: (point.lat - origin.lat) * METERS_PER_DEGREE_LAT,
  };
}

function fromLocalMeters(local: { x: number; y: number }, origin: RoadPoint): RoadPoint {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return {
    lat: origin.lat + local.y / METERS_PER_DEGREE_LAT,
    lng: origin.lng + local.x / metersPerDegreeLng,
  };
}

function projectOnSegment(
  point: RoadPoint,
  start: RoadPoint,
  end: RoadPoint,
): { point: RoadPoint; t: number; distanceMeters: number } {
  const origin = start;
  const p = toLocalMeters(point, origin);
  const a = toLocalMeters(start, origin);
  const b = toLocalMeters(end, origin);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared < 1 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  const closest = { x: a.x + dx * t, y: a.y + dy * t };
  const distX = p.x - closest.x;
  const distY = p.y - closest.y;
  return {
    point: fromLocalMeters(closest, origin),
    t,
    distanceMeters: Math.hypot(distX, distY),
  };
}

function samePoint(a: RoadPoint, b: RoadPoint, epsilon = 0.0000008): boolean {
  return Math.abs(a.lat - b.lat) < epsilon && Math.abs(a.lng - b.lng) < epsilon;
}

/** Remaining road polyline from the rider onward. No extra Maps request. */
export function remainingPathFrom(path: RoadPoint[], rider: RoadPoint): RoadPoint[] {
  if (path.length === 0) return [rider];
  if (path.length === 1) {
    return samePoint(path[0], rider) ? path : [rider, path[0]];
  }

  let bestIndex = 0;
  let best = projectOnSegment(rider, path[0], path[1]);
  for (let index = 1; index < path.length - 1; index += 1) {
    const candidate = projectOnSegment(rider, path[index], path[index + 1]);
    if (candidate.distanceMeters < best.distanceMeters) {
      best = candidate;
      bestIndex = index;
    }
  }

  const remaining = [best.point, ...path.slice(bestIndex + 1)];
  if (!samePoint(remaining[0], rider)) {
    remaining.unshift(rider);
  }
  return remaining.length >= 2 ? remaining : [rider, path[path.length - 1]];
}

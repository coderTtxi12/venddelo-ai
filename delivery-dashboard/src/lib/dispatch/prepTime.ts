export function prepMinutesFromTimes(
  createdAt?: string | null,
  readyAt?: string | null,
): number | null {
  if (!createdAt || !readyAt) return null;
  const created = Date.parse(createdAt);
  const ready = Date.parse(readyAt);
  if (!Number.isFinite(created) || !Number.isFinite(ready)) return null;
  const minutes = Math.round((ready - created) / 60_000);
  if (minutes < 1) return null;
  return minutes;
}

export function formatPrepMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 1) return null;
  return minutes === 1 ? '1 min' : `${minutes} min`;
}

export function requestPrepMinutes(request: {
  prep_minutes?: number | null;
  created_at?: string | null;
  ready_at?: string | null;
}): number | null {
  if (request.prep_minutes != null && request.prep_minutes >= 1) {
    return request.prep_minutes;
  }
  return prepMinutesFromTimes(request.created_at, request.ready_at);
}

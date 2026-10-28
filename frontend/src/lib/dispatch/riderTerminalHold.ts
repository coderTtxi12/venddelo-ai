import type { DispatchRequest } from '@/lib/api/dispatch';

export type RiderTerminalHoldGroup = {
  key: string;
  riderName: string;
  photoUrl: string | null;
  requests: DispatchRequest[];
};

export function hasHeldTerminal(request: DispatchRequest): boolean {
  return request.terminal_hold_status === 'held';
}

export function groupHeldTerminals(requests: DispatchRequest[]): RiderTerminalHoldGroup[] {
  const groups = new Map<string, RiderTerminalHoldGroup>();

  for (const request of requests) {
    if (!hasHeldTerminal(request)) continue;
    const holder = request.terminal_holder;
    const key = holder?.driver_id ?? `request:${request.id}`;
    const current = groups.get(key);
    if (current) {
      current.requests.push(request);
      continue;
    }
    groups.set(key, {
      key,
      riderName: holder?.first_name?.trim() || 'Repartidor',
      photoUrl: holder?.photo_url ?? null,
      requests: [request],
    });
  }

  return [...groups.values()];
}

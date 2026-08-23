export type RestaurantDispatchSseEvent =
  | { type: 'dispatch.updated'; requestId?: string; status?: string }
  | { type: 'delivery.service.updated' };

const KNOWN_EVENT_TYPES = new Set<RestaurantDispatchSseEvent['type']>([
  'dispatch.updated',
  'delivery.service.updated',
]);

export function shouldOpenRestaurantDispatchSse(input: {
  restaurantId: string | null;
  accessToken: string | null;
  visibilityState: DocumentVisibilityState;
}): boolean {
  return Boolean(
    input.restaurantId && input.accessToken && input.visibilityState === 'visible',
  );
}

export function parseRestaurantDispatchSseBlock(
  block: string,
): RestaurantDispatchSseEvent | null {
  const trimmed = block.trim();
  if (!trimmed || trimmed.startsWith(':')) return null;

  let eventName = 'message';
  const dataLines: string[] = [];
  for (const line of trimmed.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0) return null;
  if (eventName !== 'message' && !KNOWN_EVENT_TYPES.has(eventName as RestaurantDispatchSseEvent['type'])) {
    return null;
  }

  try {
    const payload = JSON.parse(dataLines.join('\n')) as {
      type?: string;
      request_id?: unknown;
      status?: unknown;
    };
    if (payload.type === 'delivery.service.updated') {
      return { type: 'delivery.service.updated' };
    }
    if (payload.type === 'dispatch.updated') {
      const requestId = typeof payload.request_id === 'string' ? payload.request_id : undefined;
      const status = typeof payload.status === 'string' ? payload.status : undefined;
      return {
        type: 'dispatch.updated',
        ...(requestId ? { requestId } : {}),
        ...(status ? { status } : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}

const DISPATCH_STATUSES = new Set([
  'scheduled',
  'searching',
  'offered',
  'assigned',
  'picked_up',
  'in_transit',
  'delivered',
  'unassigned',
  'cancelled',
]);

const STATUS_RANK: Record<string, number> = {
  scheduled: 0,
  searching: 1,
  offered: 2,
  assigned: 3,
  picked_up: 4,
  in_transit: 5,
  delivered: 6,
};

export function mergeDispatchStatus(current: string, incoming: string): string {
  if (incoming === current) return incoming;
  if (incoming === 'cancelled' || incoming === 'unassigned') return incoming;
  if (current === 'cancelled' || current === 'unassigned') return incoming;
  const currentRank = STATUS_RANK[current];
  const incomingRank = STATUS_RANK[incoming];
  if (currentRank == null) return incoming;
  if (incomingRank == null) return current;
  return incomingRank >= currentRank ? incoming : current;
}

export function mergeDispatchRequest<T extends { id: string; status: string }>(
  current: T | undefined,
  incoming: T,
): T {
  if (!current) return incoming;
  const status = mergeDispatchStatus(current.status, incoming.status);
  if (status !== incoming.status) {
    return { ...incoming, ...current, status: status as T['status'] };
  }
  return { ...current, ...incoming, status: status as T['status'] };
}

export function mergeDispatchRequestLists<T extends { id: string; status: string }>(
  current: T[],
  incoming: T[],
): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  return incoming.map((row) => mergeDispatchRequest(byId.get(row.id), row));
}

export function patchRequestsFromDispatchEvent<T extends { id: string; status: string }>(
  requests: T[],
  event: RestaurantDispatchSseEvent,
): T[] {
  if (event.type !== 'dispatch.updated') return requests;
  const requestId = event.requestId;
  const status = event.status;
  if (!requestId || !status || !DISPATCH_STATUSES.has(status)) return requests;
  return requests.map((item) =>
    item.id === requestId
      ? { ...item, status: mergeDispatchStatus(item.status, status) as T['status'] }
      : item,
  );
}

export type RestaurantDispatchSseEvent =
  | { type: 'dispatch.updated' }
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
    const payload = JSON.parse(dataLines.join('\n')) as { type?: string };
    if (payload.type === 'dispatch.updated' || payload.type === 'delivery.service.updated') {
      return { type: payload.type };
    }
    return null;
  } catch {
    return null;
  }
}

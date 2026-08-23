type MapWithDiv = {
  getDiv: () => HTMLElement;
};

function asMapWithDiv(map: unknown): MapWithDiv | null {
  if (!map || typeof map !== 'object') return null;
  const getDiv = Reflect.get(map, 'getDiv');
  if (typeof getDiv !== 'function') return null;
  return map as MapWithDiv;
}

export function mapNeedsNewInstance(
  map: unknown,
  container: HTMLElement | null,
): boolean {
  if (!container) return true;
  const current = asMapWithDiv(map);
  if (!current) return true;
  return current.getDiv() !== container;
}

export function triggerGoogleMapResize(map: object): void {
  const eventApi = (
    google.maps as typeof google.maps & {
      event?: { trigger: (instance: object, eventName: string) => void };
    }
  ).event;
  eventApi?.trigger(map, 'resize');
}

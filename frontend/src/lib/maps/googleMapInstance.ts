type MapWithDiv = {
  getDiv?: () => HTMLElement;
};

export function mapNeedsNewInstance(
  map: MapWithDiv | null,
  container: HTMLElement | null,
): boolean {
  if (!container) return true;
  if (!map || typeof map.getDiv !== 'function') return true;
  return map.getDiv() !== container;
}

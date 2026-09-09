export const HISTORY_PAGE_SIZE = 50;

export type HistoryEntityMode = 'include' | 'exclude';

export type HistoryEntityOption = {
  id: string;
  label: string;
};

export type DispatchHistoryQuery = {
  start: string;
  end: string;
  q?: string;
  status?: 'delivered' | 'cancelled';
  restaurantIds?: string[];
  restaurantMode?: HistoryEntityMode;
  driverIds?: string[];
  driverMode?: HistoryEntityMode;
  zoneId?: string | null;
  limit?: number;
  offset?: number;
};

export function normalizeHistoryQuery(raw: string): string {
  return raw.trim().toUpperCase().replace(/^#+/, '').replace(/[^0-9A-Z]/g, '');
}

export function historyEmptyTitle(q: string): string {
  const id = normalizeHistoryQuery(q);
  if (id) return `No encontramos el pedido #${id} en el historial.`;
  return 'No hay pedidos cerrados en este periodo.';
}

export function historyEmptyHint(q: string): string | null {
  if (!normalizeHistoryQuery(q)) return null;
  return 'Revisa el ID o borra la búsqueda para volver al periodo.';
}

export function historySearchScopeHint(q: string): string | null {
  if (!normalizeHistoryQuery(q)) return null;
  return 'La búsqueda por ID recorre todo el historial, no solo este periodo.';
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es');
}

export function matchesEntityQuery(label: string, query: string): boolean {
  const needle = normalizeSearch(query).trim();
  if (!needle) return true;
  return normalizeSearch(label).includes(needle);
}

export function filterEntityOptions(
  options: HistoryEntityOption[],
  query: string,
): HistoryEntityOption[] {
  return options.filter((option) => matchesEntityQuery(option.label, query));
}

export function toggleEntityId(ids: string[], id: string): string[] {
  if (!id) return [];
  return ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id];
}

export function selectedEntityOptions(
  options: HistoryEntityOption[],
  ids: string[],
): HistoryEntityOption[] {
  const byId = new Map(options.map((option) => [option.id, option]));
  return ids.flatMap((id) => {
    const option = byId.get(id);
    return option ? [option] : [];
  });
}

export function historyEntityModeLabel(mode: HistoryEntityMode, count: number): string {
  if (mode === 'exclude') return 'Todos excepto';
  return count > 1 ? 'Solo estos' : 'Solo este';
}

export function historyPageRangeLabel(
  offset: number,
  itemCount: number,
  total: number,
): string {
  if (total <= 0 || itemCount <= 0) return '0 pedidos en este periodo';
  const from = offset + 1;
  const to = offset + itemCount;
  return `${from}–${to} de ${total} pedidos`;
}

function applyEntityParams(
  qs: URLSearchParams,
  ids: string[] | undefined,
  mode: HistoryEntityMode | undefined,
  includeKey: string,
  excludeKey: string,
) {
  if (!ids?.length) return;
  const key = mode === 'exclude' ? excludeKey : includeKey;
  for (const id of ids) qs.append(key, id);
}

export function dispatchHistorySearchParams(query: DispatchHistoryQuery): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set('start', query.start);
  qs.set('end', query.end);
  const q = normalizeHistoryQuery(query.q ?? '');
  if (q) qs.set('q', q);
  if (query.status) qs.set('status', query.status);
  applyEntityParams(
    qs,
    query.restaurantIds,
    query.restaurantMode,
    'restaurant_id',
    'exclude_restaurant_id',
  );
  applyEntityParams(qs, query.driverIds, query.driverMode, 'driver_id', 'exclude_driver_id');
  if (query.zoneId) qs.set('zone_id', query.zoneId);
  qs.set('limit', String(query.limit ?? HISTORY_PAGE_SIZE));
  qs.set('offset', String(query.offset ?? 0));
  return qs;
}

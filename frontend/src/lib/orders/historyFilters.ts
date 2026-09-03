export type HistoryStatusFilter = 'all' | 'delivered' | 'cancelled';
export type HistoryTypeFilter = 'all' | 'delivery' | 'takeout';
export type HistoryPaymentFilter = 'all' | 'cash' | 'transfer' | 'card_terminal';
export type HistoryRecencyFilter = 'all' | 'today' | '7d' | '30d' | 'custom';
export type HistorySort = 'created_at' | 'total_cents';
export type HistorySortOrder = 'asc' | 'desc';

export const HISTORY_STATUS_LABELS: Record<HistoryStatusFilter, string> = {
  all: 'Todos',
  delivered: 'Entregados',
  cancelled: 'Cancelados',
};

export const HISTORY_TYPE_LABELS: Record<HistoryTypeFilter, string> = {
  all: 'Todos',
  delivery: 'Entrega',
  takeout: 'Para llevar',
};

export const HISTORY_PAYMENT_LABELS: Record<HistoryPaymentFilter, string> = {
  all: 'Todos',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card_terminal: 'Terminal',
};

export const HISTORY_RECENCY_LABELS: Record<Exclude<HistoryRecencyFilter, 'custom'>, string> = {
  all: 'Todo',
  today: 'Hoy',
  '7d': '7 días',
  '30d': '30 días',
};

export const HISTORY_MOBILE_SORT_OPTIONS: Record<string, string> = {
  'created_at:desc': 'Más recientes',
  'created_at:asc': 'Más antiguos',
  'total_cents:desc': 'Mayor total',
  'total_cents:asc': 'Menor total',
};

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function historyDateRange(
  preset: Exclude<HistoryRecencyFilter, 'custom' | 'all'>,
  now = new Date(),
): { from: string; to: string } {
  const to = utcDateString(now);
  if (preset === 'today') return { from: to, to };
  const days = preset === '7d' ? 6 : 29;
  const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  fromDate.setUTCDate(fromDate.getUTCDate() - days);
  return { from: utcDateString(fromDate), to };
}

export function resolveHistoryDateBounds(input: {
  recency: HistoryRecencyFilter;
  customFrom?: string;
  customTo?: string;
  now?: Date;
}): { from?: string; to?: string } {
  if (input.recency === 'all') return {};
  if (input.recency === 'custom') {
    return {
      from: input.customFrom || undefined,
      to: input.customTo || undefined,
    };
  }
  return historyDateRange(input.recency, input.now);
}

export function historyFiltersActive(filters: {
  query: string;
  status: HistoryStatusFilter;
  type: HistoryTypeFilter;
  payment: HistoryPaymentFilter;
  recency: HistoryRecencyFilter;
  customFrom?: string;
  customTo?: string;
}): boolean {
  if (filters.query.trim()) return true;
  if (filters.status !== 'all') return true;
  if (filters.type !== 'all') return true;
  if (filters.payment !== 'all') return true;
  if (filters.recency !== 'all') return true;
  return false;
}

export function toggleHistoryColumnSort(
  current: { sort: HistorySort; order: HistorySortOrder },
  column: HistorySort,
): { sort: HistorySort; order: HistorySortOrder } {
  if (current.sort !== column) {
    return { sort: column, order: column === 'created_at' ? 'desc' : 'desc' };
  }
  return { sort: column, order: current.order === 'desc' ? 'asc' : 'desc' };
}

import type { OrderStatus, OrderStatusSummary } from '@/lib/api/types';

export type OrderStatusMeta = {
  label: string;
  shortLabel: string;
  tone: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  nextStatus: OrderStatus | null;
  nextActionLabel: string | null;
};

export const ORDER_STATUS_META: Record<OrderStatus, OrderStatusMeta> = {
  pending: {
    label: 'Pendiente',
    shortLabel: 'Nuevo',
    tone: 'pending',
    nextStatus: 'confirmed',
    nextActionLabel: 'Confirmar',
  },
  confirmed: {
    label: 'Confirmado',
    shortLabel: 'Confirmado',
    tone: 'confirmed',
    nextStatus: 'preparing',
    nextActionLabel: 'Preparar',
  },
  preparing: {
    label: 'En preparación',
    shortLabel: 'Cocina',
    tone: 'preparing',
    nextStatus: 'ready',
    nextActionLabel: 'Marcar listo',
  },
  ready: {
    label: 'Listo',
    shortLabel: 'Listo',
    tone: 'ready',
    nextStatus: 'delivered',
    nextActionLabel: 'Entregado',
  },
  delivered: {
    label: 'Entregado',
    shortLabel: 'Entregado',
    tone: 'delivered',
    nextStatus: null,
    nextActionLabel: null,
  },
  cancelled: {
    label: 'Cancelado',
    shortLabel: 'Cancelado',
    tone: 'cancelled',
    nextStatus: null,
    nextActionLabel: null,
  },
};

export type OrderStatusFilter = 'new' | 'all' | 'active' | OrderStatus;

export type OrderStatusFilterGroup = 'workflow' | 'archive' | 'view';

export type OrderStatusFilterOption = {
  value: OrderStatusFilter;
  label: string;
  group: OrderStatusFilterGroup;
  primary?: boolean;
  tone?: OrderStatusMeta['tone'];
};

/** Active kitchen pipeline: Nuevos → Confirmados → Preparando → Listos */
export const KITCHEN_WORKFLOW_FILTER_OPTIONS: OrderStatusFilterOption[] = [
  { value: 'new', label: 'Nuevos', group: 'workflow', primary: true, tone: 'pending' },
  { value: 'confirmed', label: 'Confirmados', group: 'workflow', tone: 'confirmed' },
  { value: 'preparing', label: 'Preparando', group: 'workflow', tone: 'preparing' },
  { value: 'ready', label: 'Listos', group: 'workflow', tone: 'ready' },
];

/** Closed orders — outside the live kitchen flow */
export const KITCHEN_ARCHIVE_FILTER_OPTIONS: OrderStatusFilterOption[] = [
  { value: 'delivered', label: 'Entregados', group: 'archive', tone: 'delivered' },
  { value: 'cancelled', label: 'Cancelados', group: 'archive', tone: 'cancelled' },
];

/** Aggregate views — separated from status-specific filters */
export const KITCHEN_VIEW_FILTER_OPTIONS: OrderStatusFilterOption[] = [
  { value: 'active', label: 'Activos', group: 'view' },
  { value: 'all', label: 'Todos', group: 'view' },
];

export const ORDER_STATUS_FILTER_OPTIONS: OrderStatusFilterOption[] = [
  ...KITCHEN_WORKFLOW_FILTER_OPTIONS,
  ...KITCHEN_ARCHIVE_FILTER_OPTIONS,
  ...KITCHEN_VIEW_FILTER_OPTIONS,
];

export const DEFAULT_KITCHEN_STATUS_FILTER: OrderStatusFilter = 'new';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
];

export function matchesOrderStatusFilter(status: OrderStatus, filter: OrderStatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'new') return status === 'pending';
  if (filter === 'active') return ACTIVE_ORDER_STATUSES.includes(status);
  return status === filter;
}

export function buildOrderStatusFilterCounts(
  orders: readonly { status: OrderStatus }[],
): Record<OrderStatusFilter, number> {
  return ORDER_STATUS_FILTER_OPTIONS.reduce(
    (counts, option) => {
      counts[option.value] = orders.filter((order) =>
        matchesOrderStatusFilter(order.status, option.value),
      ).length;
      return counts;
    },
    {} as Record<OrderStatusFilter, number>,
  );
}

export function canCancelOrder(status: OrderStatus): boolean {
  return status !== 'delivered' && status !== 'cancelled';
}

export type KitchenOrdersListQuery = {
  status?: OrderStatus;
  view?: 'active' | 'archive';
};

export function orderFilterToApiParams(filter: OrderStatusFilter): KitchenOrdersListQuery {
  if (filter === 'all') return {};
  if (filter === 'active') return { view: 'active' };
  if (filter === 'new') return { status: 'pending' };
  return { status: filter };
}

export function buildFilterCountsFromSummary(
  summary: OrderStatusSummary,
): Record<OrderStatusFilter, number> {
  return {
    new: summary.pending,
    confirmed: summary.confirmed,
    preparing: summary.preparing,
    ready: summary.ready,
    delivered: summary.delivered,
    cancelled: summary.cancelled,
    active: summary.active,
    all: summary.total,
  };
}

export function orderStatusSummaryTransitionKey(
  orderId: string,
  previousStatus: OrderStatus | null,
  nextStatus: OrderStatus,
): string {
  return `${orderId}:${previousStatus ?? '__new__'}:${nextStatus}`;
}

export function applyOrderStatusSummaryDelta(
  summary: OrderStatusSummary,
  previousStatus: OrderStatus | null,
  nextStatus: OrderStatus,
): OrderStatusSummary {
  const next: OrderStatusSummary = { ...summary };
  if (previousStatus) {
    next[previousStatus] = Math.max(0, next[previousStatus] - 1);
  }
  next[nextStatus] = next[nextStatus] + 1;
  next.active = ACTIVE_ORDER_STATUSES.reduce((total, status) => total + next[status], 0);
  next.total =
    next.pending +
    next.confirmed +
    next.preparing +
    next.ready +
    next.delivered +
    next.cancelled;
  return next;
}

export const EMPTY_ORDER_STATUS_SUMMARY: OrderStatusSummary = {
  pending: 0,
  confirmed: 0,
  preparing: 0,
  ready: 0,
  delivered: 0,
  cancelled: 0,
  active: 0,
  total: 0,
};

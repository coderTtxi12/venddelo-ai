import type { Order, OrderStatus, OrderStatusSummary } from '@/lib/api/types';
import { ORDER_STATUS_META, type OrderStatusFilter } from '@/lib/orders/orderStatus';

export type KitchenBulkActions = {
  canSelect: boolean;
  canCancel: boolean;
  advanceLabel: string | null;
  advanceStatus: OrderStatus | null;
};

export function isClearedFromKitchen(order: Pick<Order, 'kds_cleared_at'>): boolean {
  return order.kds_cleared_at != null;
}

export function applyKitchenBoardCleared(orders: readonly Order[]): Order[] {
  return orders.filter((order) => order.status !== 'delivered' && order.status !== 'cancelled');
}

export function applyKitchenBoardClearedToSummary(
  summary: OrderStatusSummary,
): OrderStatusSummary {
  return {
    ...summary,
    delivered: 0,
    cancelled: 0,
    total: summary.active,
  };
}

export function kitchenClosedCount(summary: Pick<OrderStatusSummary, 'delivered' | 'cancelled'>): number {
  return summary.delivered + summary.cancelled;
}

export function kitchenBulkActions(filter: OrderStatusFilter): KitchenBulkActions {
  if (filter === 'new') {
    return { canSelect: true, canCancel: true, advanceLabel: null, advanceStatus: null };
  }
  if (filter === 'confirmed' || filter === 'preparing' || filter === 'ready') {
    const meta = ORDER_STATUS_META[filter];
    return {
      canSelect: true,
      canCancel: true,
      advanceLabel: bulkAdvanceLabel(filter),
      advanceStatus: meta.nextStatus,
    };
  }
  return { canSelect: false, canCancel: false, advanceLabel: null, advanceStatus: null };
}

function bulkAdvanceLabel(filter: 'confirmed' | 'preparing' | 'ready'): string {
  if (filter === 'confirmed') return 'Preparar';
  if (filter === 'preparing') return 'Marcar listos';
  return 'Marcar entregados';
}

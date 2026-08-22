'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantOrders } from '@/contexts/RestaurantOrdersContext';
import { getRestaurantOrderSummary, listRestaurantOrders } from '@/lib/api/orders';
import type { Order, OrderStatus, OrderStatusSummary } from '@/lib/api/types';
import { EMPTY_ORDER_STATUS_SUMMARY } from '@/lib/orders/orderStatus';
import {
  countOrderItems,
  formatCents,
  formatOrderDateTime,
  formatOrderDisplayId,
  formatOrderElapsed,
  formatOrderPaymentLabel,
  formatOrderTypeLabel,
} from '@/lib/orders/orderDisplay';
import { useKitchenOrdersInfiniteScroll } from '@/lib/orders/useKitchenOrdersInfiniteScroll';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import styles from './OrdersKitchen.module.css';

type HistoryFilter = 'all' | 'delivered' | 'cancelled';

const PAGE_SIZE = 50;

function statusLabel(status: OrderStatus): string {
  if (status === 'delivered') return 'Entregado';
  if (status === 'cancelled') return 'Cancelado';
  return status;
}

export default function OrderHistoryView() {
  const { accessToken } = useAuth();
  const { restaurantId } = useRestaurantOrders();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<OrderStatusSummary>(EMPTY_ORDER_STATUS_SUMMARY);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadPage = useCallback(
    async (cursor: string | null) => {
      if (!accessToken || !restaurantId) return;
      const query = {
        board: 'history' as const,
        status: filter === 'all' ? undefined : filter,
      };
      const [page, nextSummary] = await Promise.all([
        listRestaurantOrders(accessToken, restaurantId, PAGE_SIZE, cursor, query),
        cursor ? Promise.resolve(null) : getRestaurantOrderSummary(accessToken, restaurantId, 'history'),
      ]);
      if (nextSummary) setSummary(nextSummary);
      setNextCursor(page.next_cursor);
      setHasMore(page.has_more);
      setOrders((current) => (cursor ? [...current, ...page.items] : page.items));
    },
    [accessToken, filter, restaurantId],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !restaurantId) {
        setOrders([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await loadPage(null);
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) setError('No se pudo cargar el historial.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, loadPage, restaurantId]);

  const loadMore = useCallback(() => {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    void loadPage(nextCursor).finally(() => setLoadingMore(false));
  }, [hasMore, loadPage, loadingMore, nextCursor]);

  const sentinelRef = useKitchenOrdersInfiniteScroll(!loading, hasMore, loadingMore, loadMore);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null,
    [orders, selectedOrderId],
  );

  const counts = {
    all: summary.total,
    delivered: summary.delivered,
    cancelled: summary.cancelled,
  };

  if (loading) {
    return (
      <div className={styles.kitchen}>
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>Cargando historial…</p>
          <p className={styles.stateText}>Pedidos entregados y cancelados.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.kitchen}>
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>No se pudo cargar el historial</p>
          <p className={styles.stateText}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.kitchen}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>Historial</h1>
          <p className={styles.subtitle}>
            Pedidos cerrados, incluidos los que ya limpiaste de cocina.
          </p>
        </div>
      </header>

      <div className={styles.filtersBar}>
        <div className={styles.filterArchiveGroup} role="tablist" aria-label="Historial de pedidos">
          {([
            ['all', 'Todos'],
            ['delivered', 'Entregados'],
            ['cancelled', 'Cancelados'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={`${styles.filterChip} ${styles.filterChipArchive} ${
                filter === value ? styles.filterChipActive : ''
              }`}
              onClick={() => setFilter(value)}
            >
              {label}
              <span className={styles.filterChipCount}>{counts[value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.board}>
        <section className={styles.listPanel} aria-label="Historial de pedidos">
          <div className={styles.listHeader}>
            <h2 className={styles.listTitle}>Cerrados</h2>
            <span className={styles.listCount}>
              {orders.length === 1 ? '1 pedido' : `${orders.length} pedidos`}
            </span>
          </div>
          <div className={styles.listScroll}>
            {orders.length === 0 ? (
              <div className={styles.stateBox}>
                <p className={styles.stateTitle}>Sin pedidos en el historial</p>
                <p className={styles.stateText}>
                  Aquí aparecen entregados y cancelados, también después de limpiar la cocina.
                </p>
              </div>
            ) : (
              orders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className={`${styles.ticket} ${
                    order.id === selectedOrder?.id ? styles.ticketSelected : ''
                  }`}
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <div className={styles.ticketTop}>
                    <span className={styles.ticketId}>#{formatOrderDisplayId(order)}</span>
                    <span className={styles.ticketTime}>
                      {formatOrderElapsed(order.created_at, now)}
                    </span>
                  </div>
                  <div className={styles.ticketMeta}>
                    <span className={styles.ticketCustomer}>{order.customer_name}</span>
                    <span
                      className={`${styles.statusBadge} ${
                        order.status === 'delivered' ? styles.statusDelivered : styles.statusCancelled
                      }`}
                    >
                      {statusLabel(order.status)}
                    </span>
                  </div>
                  <p className={styles.ticketSummary}>
                    {countOrderItems(order.items) === 1
                      ? '1 artículo'
                      : `${countOrderItems(order.items)} artículos`}{' '}
                    · {formatCents(order.total_cents)}
                  </p>
                </button>
              ))
            )}
            {loadingMore ? <p className={styles.stateText}>Cargando más pedidos…</p> : null}
            <div ref={sentinelRef} aria-hidden className={styles.loadMoreSentinel} />
          </div>
        </section>

        <section className={styles.detailPanel} aria-label="Detalle del historial">
          {selectedOrder ? (
            <div className={`${styles.detailScroll} ${styles.historyDetail}`}>
              <p className={styles.ticketId}>#{formatOrderDisplayId(selectedOrder)}</p>
              <p className={styles.subtitle}>{selectedOrder.customer_name}</p>
              <p className={styles.ticketSummary}>
                {formatOrderTypeLabel(selectedOrder.type)} ·{' '}
                {formatOrderPaymentLabel(selectedOrder.payment_method)} ·{' '}
                {formatOrderDateTime(selectedOrder.created_at)}
              </p>
              <p className={styles.ticketSummary}>
                WhatsApp: {formatOrderCustomerPhone(selectedOrder.customer_phone)}
              </p>
              {selectedOrder.cancellation_reason ? (
                <p className={styles.ticketSummary}>Motivo: {selectedOrder.cancellation_reason}</p>
              ) : null}
              <ul className={styles.historyItems}>
                {selectedOrder.items.map((item) => (
                  <li key={item.id}>
                    {item.quantity}× {item.product_name}
                  </li>
                ))}
              </ul>
              <p className={styles.ticketId}>{formatCents(selectedOrder.total_cents)}</p>
            </div>
          ) : (
            <div className={styles.stateBox}>
              <p className={styles.stateTitle}>Elige un pedido</p>
              <p className={styles.stateText}>El detalle del historial aparece aquí.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

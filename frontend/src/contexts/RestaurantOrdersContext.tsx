'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNewOrderSoundAlert } from '@/hooks/useNewOrderSoundAlert';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import type { Order } from '@/lib/api/types';
import {
  fetchKitchenOrdersPage,
  getKitchenOrdersCache,
  invalidateKitchenOrdersCache,
  KITCHEN_ORDERS_INITIAL_PAGE_SIZE,
  setKitchenOrdersCache,
} from '@/lib/orders/kitchenOrdersCache';
import { listRestaurantOrders } from '@/lib/api/orders';
import {
  applyOrderStatusSummaryDelta,
  buildFilterCountsFromSummary,
  orderStatusSummaryTransitionKey,
  DEFAULT_KITCHEN_STATUS_FILTER,
  EMPTY_ORDER_STATUS_SUMMARY,
  matchesOrderStatusFilter,
  orderFilterToApiParams,
  type OrderStatusFilter,
} from '@/lib/orders/orderStatus';
import { sortOrdersNewestFirst } from '@/lib/orders/orderDisplay';
import {
  applyKitchenOrderSocketEvent,
  type KitchenSocketConnectionStatus,
  useKitchenOrdersSocket,
} from '@/lib/orders/useKitchenOrdersSocket';

export { KITCHEN_ORDERS_INITIAL_PAGE_SIZE };

type RestaurantOrdersContextValue = {
  restaurantId: string | null;
  restaurantName: string | null;
  orders: Order[];
  ordersHasMore: boolean;
  kitchenFilter: OrderStatusFilter;
  setKitchenFilter: (filter: OrderStatusFilter) => void;
  filterCounts: Record<OrderStatusFilter, number>;
  pendingOrdersCount: number;
  socketStatus: KitchenSocketConnectionStatus;
  socketLive: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadError: string | null;
  refreshing: boolean;
  refreshOrders: () => void;
  loadMoreOrders: () => void;
  replaceOrder: (order: Order) => void;
};

const RestaurantOrdersContext = createContext<RestaurantOrdersContextValue | null>(null);

export function RestaurantOrdersProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const {
    loading: accessLoading,
    selectedRestaurantId,
    selectedRestaurantName,
    loadError: accessError,
  } = useRestaurantAccess();

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersNextCursor, setOrdersNextCursor] = useState<string | null>(null);
  const [ordersHasMore, setOrdersHasMore] = useState(false);
  const [kitchenFilter, setKitchenFilterState] = useState<OrderStatusFilter>(
    DEFAULT_KITCHEN_STATUS_FILTER,
  );
  const [statusSummary, setStatusSummary] = useState(EMPTY_ORDER_STATUS_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<KitchenSocketConnectionStatus>('offline');
  const kitchenFilterRef = useRef(kitchenFilter);
  const statusSummaryRef = useRef(statusSummary);
  const recentSummaryTransitionsRef = useRef<Set<string>>(new Set());
  const alertNewOrder = useNewOrderSoundAlert();

  const commitSummaryTransition = useCallback(
    (orderId: string, previousStatus: Order['status'] | null, nextStatus: Order['status']) => {
      if (previousStatus === nextStatus) return;
      const key = orderStatusSummaryTransitionKey(orderId, previousStatus, nextStatus);
      if (recentSummaryTransitionsRef.current.has(key)) return;
      recentSummaryTransitionsRef.current.add(key);
      setStatusSummary((summary) =>
        applyOrderStatusSummaryDelta(summary, previousStatus, nextStatus),
      );
    },
    [],
  );

  useEffect(() => {
    kitchenFilterRef.current = kitchenFilter;
  }, [kitchenFilter]);

  useEffect(() => {
    statusSummaryRef.current = statusSummary;
  }, [statusSummary]);

  const persistCache = useCallback(
    (
      restaurantId: string,
      filter: OrderStatusFilter,
      nextOrders: Order[],
      nextCursor: string | null,
      hasMore: boolean,
      summary = statusSummaryRef.current,
    ) => {
      setKitchenOrdersCache(restaurantId, filter, {
        orders: nextOrders,
        nextCursor: nextCursor,
        hasMore,
        summary,
      });
    },
    [],
  );

  const loadOrdersForFilter = useCallback(
    async (
      token: string,
      rid: string,
      filter: OrderStatusFilter,
      options?: { silent?: boolean },
    ) => {
      if (!options?.silent) setRefreshing(true);
      setLoadError(null);

      try {
        const entry = await fetchKitchenOrdersPage(token, rid, filter);
        setOrders(entry.orders);
        setOrdersNextCursor(entry.nextCursor);
        setOrdersHasMore(entry.hasMore);
        recentSummaryTransitionsRef.current.clear();
        setStatusSummary(entry.summary);
        setKitchenOrdersCache(rid, filter, entry, entry.fetchedAt);
      } catch (error) {
        console.error(error);
        setLoadError('No se pudieron cargar los pedidos.');
      } finally {
        if (!options?.silent) setRefreshing(false);
      }
    },
    [],
  );

  const loadMoreOrders = useCallback(async () => {
    if (
      !accessToken ||
      !selectedRestaurantId ||
      !ordersHasMore ||
      !ordersNextCursor ||
      loadingMore
    ) {
      return;
    }

    setLoadingMore(true);
    setLoadError(null);

    try {
      const page = await listRestaurantOrders(
        accessToken,
        selectedRestaurantId,
        KITCHEN_ORDERS_INITIAL_PAGE_SIZE,
        ordersNextCursor,
        orderFilterToApiParams(kitchenFilterRef.current),
      );
      setOrders((current) => {
        const merged = sortOrdersNewestFirst([
          ...current,
          ...page.items.filter(
            (order) => !current.some((existing) => existing.id === order.id),
          ),
        ]);
        persistCache(
          selectedRestaurantId,
          kitchenFilterRef.current,
          merged,
          page.next_cursor,
          page.has_more,
        );
        return merged;
      });
      setOrdersNextCursor(page.next_cursor);
      setOrdersHasMore(page.has_more);
    } catch (error) {
      console.error(error);
      setLoadError('No se pudieron cargar más pedidos.');
    } finally {
      setLoadingMore(false);
    }
  }, [
    accessToken,
    loadingMore,
    ordersHasMore,
    ordersNextCursor,
    persistCache,
    selectedRestaurantId,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadRestaurantData() {
      if (accessLoading) return;
      if (!accessToken || !selectedRestaurantId) {
        setOrders([]);
        setOrdersNextCursor(null);
        setOrdersHasMore(false);
        setStatusSummary(EMPTY_ORDER_STATUS_SUMMARY);
        setLoading(false);
        return;
      }

      setLoadError(accessError);
      const cached = getKitchenOrdersCache(selectedRestaurantId, kitchenFilter);

      if (cached) {
        setOrders(cached.orders);
        setOrdersNextCursor(cached.nextCursor);
        setOrdersHasMore(cached.hasMore);
        recentSummaryTransitionsRef.current.clear();
        setStatusSummary(cached.summary);
        setLoading(false);
        void loadOrdersForFilter(accessToken, selectedRestaurantId, kitchenFilter, {
          silent: true,
        });
        return;
      }

      setLoading(true);
      try {
        await loadOrdersForFilter(accessToken, selectedRestaurantId, kitchenFilter);
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadError('No se pudo conectar con los pedidos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRestaurantData();
    return () => {
      cancelled = true;
    };
  }, [
    accessLoading,
    accessToken,
    accessError,
    kitchenFilter,
    loadOrdersForFilter,
    selectedRestaurantId,
  ]);

  useEffect(() => {
    const handleRestaurantChanged = () => {
      invalidateKitchenOrdersCache();
      setSocketStatus('offline');
      setOrders([]);
      setOrdersNextCursor(null);
      setOrdersHasMore(false);
      recentSummaryTransitionsRef.current.clear();
      setStatusSummary(EMPTY_ORDER_STATUS_SUMMARY);
      setKitchenFilterState(DEFAULT_KITCHEN_STATUS_FILTER);
    };
    window.addEventListener('venddelo:restaurant-changed', handleRestaurantChanged);
    return () => {
      window.removeEventListener('venddelo:restaurant-changed', handleRestaurantChanged);
    };
  }, []);

  useKitchenOrdersSocket(selectedRestaurantId, accessToken, {
    onStatusChange: setSocketStatus,
    onReconnect: () => {
      if (!accessToken || !selectedRestaurantId) return;
      void loadOrdersForFilter(accessToken, selectedRestaurantId, kitchenFilterRef.current, {
        silent: true,
      });
    },
    onEvent: (event) => {
      if (selectedRestaurantId) {
        invalidateKitchenOrdersCache(selectedRestaurantId);
      }
      setOrders((current) => {
        alertNewOrder(event, current);
        const previous = current.find((order) => order.id === event.order.id) ?? null;
        if (event.type === 'order.created') {
          commitSummaryTransition(event.order.id, null, event.order.status);
        } else if (previous && previous.status !== event.order.status) {
          commitSummaryTransition(event.order.id, previous.status, event.order.status);
        }
        return applyKitchenOrderSocketEvent(current, event, kitchenFilterRef.current);
      });
    },
  });

  const socketLive = socketStatus === 'live';

  const setKitchenFilter = useCallback((filter: OrderStatusFilter) => {
    setKitchenFilterState(filter);
  }, []);

  const filterCounts = useMemo(
    () => buildFilterCountsFromSummary(statusSummary),
    [statusSummary],
  );

  const pendingOrdersCount = statusSummary.pending;

  const refreshOrders = useCallback(() => {
    if (!accessToken || !selectedRestaurantId) return;
    invalidateKitchenOrdersCache(selectedRestaurantId);
    void loadOrdersForFilter(accessToken, selectedRestaurantId, kitchenFilterRef.current);
  }, [accessToken, selectedRestaurantId, loadOrdersForFilter]);

  const replaceOrder = useCallback(
    (order: Order) => {
      if (selectedRestaurantId) {
        invalidateKitchenOrdersCache(selectedRestaurantId);
      }
      setOrders((current) => {
        const previous = current.find((row) => row.id === order.id) ?? null;
        if (previous && previous.status !== order.status) {
          commitSummaryTransition(order.id, previous.status, order.status);
        }
        const next = sortOrdersNewestFirst(
          current.map((row) => (row.id === order.id ? order : row)),
        );
        if (!matchesOrderStatusFilter(order.status, kitchenFilterRef.current)) {
          return next.filter((row) => row.id !== order.id);
        }
        return next;
      });
    },
    [commitSummaryTransition, selectedRestaurantId],
  );

  useEffect(() => {
    if (!selectedRestaurantId) return;
    return () => {
      invalidateKitchenOrdersCache(selectedRestaurantId);
    };
  }, [selectedRestaurantId]);

  const value = useMemo(
    () => ({
      restaurantId: selectedRestaurantId,
      restaurantName: selectedRestaurantName,
      orders,
      ordersHasMore,
      kitchenFilter,
      setKitchenFilter,
      filterCounts,
      pendingOrdersCount,
      socketStatus,
      socketLive,
      loading: loading || accessLoading,
      loadingMore,
      loadError,
      refreshing,
      refreshOrders,
      loadMoreOrders: () => {
        void loadMoreOrders();
      },
      replaceOrder,
    }),
    [
      selectedRestaurantId,
      selectedRestaurantName,
      orders,
      ordersHasMore,
      kitchenFilter,
      setKitchenFilter,
      filterCounts,
      pendingOrdersCount,
      socketStatus,
      socketLive,
      loading,
      loadingMore,
      accessLoading,
      loadError,
      refreshing,
      refreshOrders,
      loadMoreOrders,
      replaceOrder,
    ],
  );

  return (
    <RestaurantOrdersContext.Provider value={value}>{children}</RestaurantOrdersContext.Provider>
  );
}

export function useRestaurantOrders(): RestaurantOrdersContextValue {
  const context = useContext(RestaurantOrdersContext);
  if (context == null) {
    throw new Error('useRestaurantOrders must be used within RestaurantOrdersProvider');
  }
  return context;
}

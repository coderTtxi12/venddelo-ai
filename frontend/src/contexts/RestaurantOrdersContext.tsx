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
import { listRestaurantOrders } from '@/lib/api/orders';
import { fetchAllPages } from '@/lib/api/pagination';
import type { Order } from '@/lib/api/types';
import { sortOrdersNewestFirst } from '@/lib/orders/orderDisplay';
import {
  applyKitchenOrderSocketEvent,
  useKitchenOrdersSocket,
} from '@/lib/orders/useKitchenOrdersSocket';
import { resolveSupplierIdByEmail } from '@/services/db';
import { legacyDb as db } from '@/services/legacyDb';

type RestaurantOrdersContextValue = {
  restaurantId: string | null;
  orders: Order[];
  pendingOrdersCount: number;
  socketLive: boolean;
  loading: boolean;
  loadError: string | null;
  refreshing: boolean;
  refreshOrders: () => void;
  replaceOrder: (order: Order) => void;
};

const RestaurantOrdersContext = createContext<RestaurantOrdersContextValue | null>(null);

export function RestaurantOrdersProvider({ children }: { children: ReactNode }) {
  const { firebaseUser, accessToken, loading: authLoading } = useAuth();

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [socketLive, setSocketLive] = useState(false);
  const alertNewOrder = useNewOrderSoundAlert();
  const bootstrapTokenRef = useRef<string | null>(null);

  const loadOrders = useCallback(
    async (token: string, rid: string, options?: { silent?: boolean }) => {
      if (!options?.silent) setRefreshing(true);
      setLoadError(null);

      try {
        const orderRows = await fetchAllPages(
          (cursor) => listRestaurantOrders(token, rid, 100, cursor),
          100,
        );
        setOrders(sortOrdersNewestFirst(orderRows));
      } catch (error) {
        console.error(error);
        setLoadError('No se pudieron cargar los pedidos.');
      } finally {
        if (!options?.silent) setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (authLoading) return;
      if (!accessToken) {
        bootstrapTokenRef.current = null;
        setLoading(false);
        setRestaurantId(null);
        setOrders([]);
        return;
      }

      if (bootstrapTokenRef.current === accessToken) {
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const resolved = await resolveSupplierIdByEmail(
          db,
          firebaseUser?.email ?? '',
          accessToken,
        );
        if ('error' in resolved) {
          if (!cancelled) setLoadError(resolved.error);
          return;
        }

        if (cancelled) return;
        bootstrapTokenRef.current = accessToken;
        setRestaurantId(resolved.supplierId);
        await loadOrders(accessToken, resolved.supplierId);
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadError('No se pudo conectar con los pedidos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, authLoading, firebaseUser?.email, loadOrders]);

  useKitchenOrdersSocket(restaurantId, accessToken, (event) => {
    setOrders((current) => {
      alertNewOrder(event, current);
      return applyKitchenOrderSocketEvent(current, event);
    });
    setSocketLive(true);
  });

  const pendingOrdersCount = useMemo(
    () => orders.filter((order) => order.status === 'pending').length,
    [orders],
  );

  const refreshOrders = useCallback(() => {
    if (!accessToken || !restaurantId) return;
    void loadOrders(accessToken, restaurantId);
  }, [accessToken, restaurantId, loadOrders]);

  const replaceOrder = useCallback((order: Order) => {
    setOrders((current) =>
      sortOrdersNewestFirst(current.map((row) => (row.id === order.id ? order : row))),
    );
  }, []);

  const value = useMemo(
    () => ({
      restaurantId,
      orders,
      pendingOrdersCount,
      socketLive,
      loading,
      loadError,
      refreshing,
      refreshOrders,
      replaceOrder,
    }),
    [
      restaurantId,
      orders,
      pendingOrdersCount,
      socketLive,
      loading,
      loadError,
      refreshing,
      refreshOrders,
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

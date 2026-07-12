'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNewOrderSoundAlert } from '@/hooks/useNewOrderSoundAlert';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { listRestaurantOrders } from '@/lib/api/orders';
import { getRestaurant } from '@/lib/api/restaurants';
import { fetchAllPages } from '@/lib/api/pagination';
import type { Order } from '@/lib/api/types';
import { sortOrdersNewestFirst } from '@/lib/orders/orderDisplay';
import {
  applyKitchenOrderSocketEvent,
  useKitchenOrdersSocket,
} from '@/lib/orders/useKitchenOrdersSocket';

type RestaurantOrdersContextValue = {
  restaurantId: string | null;
  restaurantName: string | null;
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
  const { accessToken } = useAuth();
  const {
    loading: accessLoading,
    selectedRestaurantId,
    selectedRestaurantName,
    loadError: accessError,
  } = useRestaurantAccess();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [socketLive, setSocketLive] = useState(false);
  const alertNewOrder = useNewOrderSoundAlert();

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

    async function loadRestaurantData() {
      if (accessLoading) return;
      if (!accessToken || !selectedRestaurantId) {
        setOrders([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(accessError);

      try {
        await Promise.all([
          getRestaurant(accessToken, selectedRestaurantId),
          loadOrders(accessToken, selectedRestaurantId),
        ]);
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
  }, [accessLoading, accessToken, accessError, selectedRestaurantId, loadOrders]);

  useEffect(() => {
    const handleRestaurantChanged = () => {
      setSocketLive(false);
      setOrders([]);
    };
    window.addEventListener('venddelo:restaurant-changed', handleRestaurantChanged);
    return () => {
      window.removeEventListener('venddelo:restaurant-changed', handleRestaurantChanged);
    };
  }, []);

  useKitchenOrdersSocket(selectedRestaurantId, accessToken, (event) => {
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
    if (!accessToken || !selectedRestaurantId) return;
    void loadOrders(accessToken, selectedRestaurantId);
  }, [accessToken, selectedRestaurantId, loadOrders]);

  const replaceOrder = useCallback((order: Order) => {
    setOrders((current) =>
      sortOrdersNewestFirst(current.map((row) => (row.id === order.id ? order : row))),
    );
  }, []);

  const value = useMemo(
    () => ({
      restaurantId: selectedRestaurantId,
      restaurantName: selectedRestaurantName,
      orders,
      pendingOrdersCount,
      socketLive,
      loading: loading || accessLoading,
      loadError,
      refreshing,
      refreshOrders,
      replaceOrder,
    }),
    [
      selectedRestaurantId,
      selectedRestaurantName,
      orders,
      pendingOrdersCount,
      socketLive,
      loading,
      accessLoading,
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

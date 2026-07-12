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
import {
  getMyRestaurant,
  listMyRestaurantAccess,
  selectMyRestaurant,
  setStoredRestaurantId,
  getStoredRestaurantId,
} from '@/lib/api/restaurants';
import type { RestaurantAccessItem } from '@/lib/api/types';
import { clearSupplierResolveCache } from '@/services/db';

type RestaurantAccessContextValue = {
  loading: boolean;
  loadError: string | null;
  accessibleRestaurants: RestaurantAccessItem[];
  selectedRestaurantId: string | null;
  selectedRestaurantName: string | null;
  memberRole: string | null;
  canSwitchRestaurants: boolean;
  switching: boolean;
  switchRestaurant: (restaurantId: string) => Promise<void>;
  refreshAccess: () => Promise<void>;
};

const RestaurantAccessContext = createContext<RestaurantAccessContextValue | null>(null);

export function RestaurantAccessProvider({ children }: { children: ReactNode }) {
  const { firebaseUser, accessToken, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessibleRestaurants, setAccessibleRestaurants] = useState<RestaurantAccessItem[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [selectedRestaurantName, setSelectedRestaurantName] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const bootstrapTokenRef = useRef<string | null>(null);

  const applySelection = useCallback(
    (item: RestaurantAccessItem | null, meRole: string | null) => {
      if (!item?.restaurant) {
        setSelectedRestaurantId(null);
        setSelectedRestaurantName(null);
        setMemberRole(null);
        return;
      }
      setSelectedRestaurantId(item.restaurant.id);
      setSelectedRestaurantName(item.restaurant.name);
      setMemberRole(meRole ?? item.member_role);
      if (firebaseUser?.uid) {
        setStoredRestaurantId(firebaseUser.uid, item.restaurant.id);
      }
    },
    [firebaseUser?.uid],
  );

  const refreshAccess = useCallback(async () => {
    if (!accessToken) return;
    const access = await listMyRestaurantAccess(accessToken);
    setAccessibleRestaurants(access.items);

    const storedId = firebaseUser?.uid ? getStoredRestaurantId(firebaseUser.uid) : null;
    const preferredId =
      storedId && access.items.some((item) => item.restaurant.id === storedId)
        ? storedId
        : undefined;
    const me = await getMyRestaurant(accessToken, preferredId);
    if (me.restaurant) {
      const activeItem =
        access.items.find((item) => item.restaurant.id === me.restaurant?.id) ??
        ({
          restaurant: me.restaurant,
          member_role: (me.member_role as 'owner' | 'admin') ?? 'admin',
          member_id: me.restaurant.id,
          last_accessed_at: null,
        } satisfies RestaurantAccessItem);
      applySelection(activeItem, me.member_role);
    } else {
      applySelection(null, null);
    }
  }, [accessToken, applySelection, firebaseUser?.uid]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (authLoading) return;
      if (!accessToken || !firebaseUser?.uid) {
        bootstrapTokenRef.current = null;
        setLoading(false);
        setAccessibleRestaurants([]);
        applySelection(null, null);
        return;
      }

      if (bootstrapTokenRef.current === accessToken) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        await refreshAccess();
        if (!cancelled) {
          bootstrapTokenRef.current = accessToken;
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setLoadError('No se pudo cargar tus restaurantes.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, authLoading, firebaseUser?.uid, refreshAccess, applySelection]);

  const switchRestaurant = useCallback(
    async (restaurantId: string) => {
      if (!accessToken || restaurantId === selectedRestaurantId) return;
      setSwitching(true);
      setLoadError(null);
      try {
        const me = await selectMyRestaurant(accessToken, restaurantId);
        clearSupplierResolveCache();
        const item = accessibleRestaurants.find(
          (entry) => entry.restaurant.id === restaurantId,
        );
        if (item) {
          applySelection(item, me.member_role);
        } else if (me.restaurant) {
          applySelection(
            {
              restaurant: me.restaurant,
              member_role: (me.member_role as 'owner' | 'admin') ?? 'admin',
              member_id: me.restaurant.id,
              last_accessed_at: null,
            },
            me.member_role,
          );
        }
        window.dispatchEvent(
          new CustomEvent('venddelo:restaurant-changed', { detail: { restaurantId } }),
        );
      } catch (error) {
        console.error(error);
        setLoadError('No se pudo cambiar de restaurante.');
      } finally {
        setSwitching(false);
      }
    },
    [accessToken, accessibleRestaurants, applySelection, selectedRestaurantId],
  );

  const value = useMemo(
    () => ({
      loading,
      loadError,
      accessibleRestaurants,
      selectedRestaurantId,
      selectedRestaurantName,
      memberRole,
      canSwitchRestaurants: accessibleRestaurants.length > 1,
      switching,
      switchRestaurant,
      refreshAccess,
    }),
    [
      loading,
      loadError,
      accessibleRestaurants,
      selectedRestaurantId,
      selectedRestaurantName,
      memberRole,
      switching,
      switchRestaurant,
      refreshAccess,
    ],
  );

  return (
    <RestaurantAccessContext.Provider value={value}>{children}</RestaurantAccessContext.Provider>
  );
}

export function useRestaurantAccess(): RestaurantAccessContextValue {
  const context = useContext(RestaurantAccessContext);
  if (context == null) {
    throw new Error('useRestaurantAccess must be used within RestaurantAccessProvider');
  }
  return context;
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import {
  getRestaurantAnalytics,
  type AnalyticsDashboard,
  type AnalyticsPeriodQuery,
} from '@/lib/api/analytics';
import { ApiError } from '@/lib/api/types';

export function useRestaurantAnalytics(query: AnalyticsPeriodQuery) {
  const { accessToken } = useAuth();
  const { selectedRestaurantId } = useRestaurantAccess();
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const restaurantIdRef = useRef(selectedRestaurantId);

  const reload = useCallback(async () => {
    if (!accessToken || !selectedRestaurantId) {
      setData(null);
      setLoading(false);
      setRefreshing(false);
      hasLoadedRef.current = false;
      restaurantIdRef.current = selectedRestaurantId;
      return;
    }

    const restaurantChanged = restaurantIdRef.current !== selectedRestaurantId;
    if (restaurantChanged) {
      restaurantIdRef.current = selectedRestaurantId;
      hasLoadedRef.current = false;
      setData(null);
    }

    setError(null);
    if (hasLoadedRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const dashboard = await getRestaurantAnalytics(accessToken, selectedRestaurantId, {
        preset: query.preset,
        ...(query.preset === 'custom' && query.start && query.end
          ? { start: query.start, end: query.end }
          : {}),
      });
      setData(dashboard);
      hasLoadedRef.current = true;
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'No se pudieron cargar las analíticas.';
      setError(message);
      if (!hasLoadedRef.current) {
        setData(null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, selectedRestaurantId, query.preset, query.start, query.end]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, refreshing, error, reload };
}

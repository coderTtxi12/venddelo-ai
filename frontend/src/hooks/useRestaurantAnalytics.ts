'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import {
  getRestaurantAnalytics,
  type AnalyticsDashboard,
  type AnalyticsGranularity,
} from '@/lib/api/analytics';
import { ApiError } from '@/lib/api/types';

export function useRestaurantAnalytics(granularity: AnalyticsGranularity) {
  const { accessToken } = useAuth();
  const { selectedRestaurantId } = useRestaurantAccess();
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken || !selectedRestaurantId) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const dashboard = await getRestaurantAnalytics(
        accessToken,
        selectedRestaurantId,
        granularity,
      );
      setData(dashboard);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'No se pudieron cargar las analíticas.';
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedRestaurantId, granularity]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

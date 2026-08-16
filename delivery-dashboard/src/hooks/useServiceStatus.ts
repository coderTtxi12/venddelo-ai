'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getMyDeliveryProviderServiceStatus,
  updateMyDeliveryProviderServiceStatus,
} from '@/lib/api/deliveryProviders';
import { ApiError } from '@/lib/api/types';
import type { DeliveryProviderServiceStatus } from '@/lib/api/types';
import { useAuth } from '@/hooks/useAuth';

export function useServiceStatus(zoneId: string | null) {
  const { accessToken } = useAuth();
  const [status, setStatus] = useState<DeliveryProviderServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken || !zoneId) {
      setStatus(null);
      setLoading(false);
      return null;
    }

    try {
      const next = await getMyDeliveryProviderServiceStatus(accessToken, zoneId);
      setStatus(next);
      setError(null);
      return next;
    } catch (err) {
      console.error(err);
      setError('No se pudo cargar el estado del servicio.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [accessToken, zoneId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const setManuallyEnabled = useCallback(
    async (manuallyEnabled: boolean) => {
      if (!accessToken || !zoneId || saving) return null;

      setSaving(true);
      setError(null);

      try {
        const confirmed = await updateMyDeliveryProviderServiceStatus(accessToken, zoneId, {
          manually_enabled: manuallyEnabled,
        });
        setStatus(confirmed);
        return confirmed;
      } catch (err) {
        console.error(err);
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('No se pudo actualizar el estado del servicio.');
        }
        return null;
      } finally {
        setSaving(false);
      }
    },
    [accessToken, zoneId, saving],
  );

  return {
    status,
    loading,
    saving,
    error,
    refresh,
    setManuallyEnabled,
  };
}

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
import {
  createMyDeliveryProviderZone,
  deleteMyDeliveryProviderZone,
  getMyDeliveryProvider,
  listMyDeliveryProviderZones,
  patchMyDeliveryProviderZone,
} from '@/lib/api/deliveryProviders';
import type { DeliveryProviderZone, DeliveryProviderZoneWrite } from '@/lib/api/types';

const STORAGE_KEY = 'delivery.selectedZoneId';

type DeliveryZoneContextValue = {
  loading: boolean;
  zones: DeliveryProviderZone[];
  selectedZoneId: string | null;
  selectedZone: DeliveryProviderZone | null;
  setSelectedZoneId: (zoneId: string) => void;
  refreshZones: () => Promise<DeliveryProviderZone[]>;
  listMyZones: () => Promise<DeliveryProviderZone[]>;
  createZone: (body: DeliveryProviderZoneWrite) => Promise<DeliveryProviderZone>;
  updateZone: (zoneId: string, body: DeliveryProviderZoneWrite) => Promise<DeliveryProviderZone>;
  deleteZone: (zoneId: string) => Promise<void>;
};

const DeliveryZoneContext = createContext<DeliveryZoneContextValue | null>(null);

function readStoredZoneId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

function persistZoneId(zoneId: string | null) {
  if (typeof window === 'undefined') return;
  if (zoneId) {
    localStorage.setItem(STORAGE_KEY, zoneId);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function resolveSelectedZoneId(
  zones: DeliveryProviderZone[],
  preferredId: string | null,
): string | null {
  if (zones.length === 0) return null;
  if (preferredId && zones.some((zone) => zone.id === preferredId)) {
    return preferredId;
  }
  return zones[0]?.id ?? null;
}

export function DeliveryZoneProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const [zones, setZones] = useState<DeliveryProviderZone[]>([]);
  const [selectedZoneId, setSelectedZoneIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applyZones = useCallback((nextZones: DeliveryProviderZone[]) => {
    setZones(nextZones);
    setSelectedZoneIdState((current) => {
      const resolved = resolveSelectedZoneId(nextZones, current ?? readStoredZoneId());
      persistZoneId(resolved);
      return resolved;
    });
  }, []);

  const refreshZones = useCallback(async () => {
    if (!accessToken) {
      setZones([]);
      setSelectedZoneIdState(null);
      persistZoneId(null);
      setLoading(false);
      return [];
    }

    setLoading(true);
    try {
      const nextZones = await listMyDeliveryProviderZones(accessToken);
      applyZones(nextZones);
      return nextZones;
    } catch (error) {
      console.error(error);
      try {
        const response = await getMyDeliveryProvider(accessToken);
        applyZones(response.zones);
        return response.zones;
      } catch (fallbackError) {
        console.error(fallbackError);
        setZones([]);
        setSelectedZoneIdState(null);
        persistZoneId(null);
        return [];
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, applyZones]);

  useEffect(() => {
    void refreshZones();
  }, [refreshZones]);

  const setSelectedZoneId = useCallback((zoneId: string) => {
    setSelectedZoneIdState(zoneId);
    persistZoneId(zoneId);
  }, []);

  const createZone = useCallback(
    async (body: DeliveryProviderZoneWrite) => {
      if (!accessToken) {
        throw new Error('No hay sesión activa.');
      }
      const created = await createMyDeliveryProviderZone(accessToken, body);
      await refreshZones();
      setSelectedZoneId(created.id);
      return created;
    },
    [accessToken, refreshZones, setSelectedZoneId],
  );

  const updateZone = useCallback(
    async (zoneId: string, body: DeliveryProviderZoneWrite) => {
      if (!accessToken) {
        throw new Error('No hay sesión activa.');
      }
      const updated = await patchMyDeliveryProviderZone(accessToken, zoneId, body);
      await refreshZones();
      return updated;
    },
    [accessToken, refreshZones],
  );

  const deleteZone = useCallback(
    async (zoneId: string) => {
      if (!accessToken) {
        throw new Error('No hay sesión activa.');
      }
      await deleteMyDeliveryProviderZone(accessToken, zoneId);
      const nextZones = await refreshZones();
      if (selectedZoneId === zoneId) {
        const fallback = nextZones[0]?.id ?? null;
        setSelectedZoneIdState(fallback);
        persistZoneId(fallback);
      }
    },
    [accessToken, refreshZones, selectedZoneId],
  );

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === selectedZoneId) ?? null,
    [zones, selectedZoneId],
  );

  const value = useMemo<DeliveryZoneContextValue>(
    () => ({
      loading,
      zones,
      selectedZoneId,
      selectedZone,
      setSelectedZoneId,
      refreshZones,
      listMyZones: refreshZones,
      createZone,
      updateZone,
      deleteZone,
    }),
    [
      loading,
      zones,
      selectedZoneId,
      selectedZone,
      setSelectedZoneId,
      refreshZones,
      createZone,
      updateZone,
      deleteZone,
    ],
  );

  return (
    <DeliveryZoneContext.Provider value={value}>{children}</DeliveryZoneContext.Provider>
  );
}

export function useDeliveryZone(): DeliveryZoneContextValue {
  const context = useContext(DeliveryZoneContext);
  if (!context) {
    throw new Error('useDeliveryZone must be used within DeliveryZoneProvider');
  }
  return context;
}

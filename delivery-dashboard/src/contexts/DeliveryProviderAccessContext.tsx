'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getMyDeliveryProvider } from '@/lib/api/deliveryProviders';
import {
  canManageMembers,
  canManagePartnerships,
  canManageWeather,
  canSimulatePricing,
  canWriteProviderConfig,
  isOperatorRole,
  memberRoleLabel,
  type DeliveryProviderMemberRole,
} from '@/lib/access/deliveryProviderPermissions';

type DeliveryProviderAccessContextValue = {
  loading: boolean;
  memberRole: DeliveryProviderMemberRole | null;
  memberRoleLabel: string;
  canManageMembers: boolean;
  canWriteProviderConfig: boolean;
  canManagePartnerships: boolean;
  canManageWeather: boolean;
  canSimulatePricing: boolean;
  isOperator: boolean;
};

const DeliveryProviderAccessContext = createContext<DeliveryProviderAccessContextValue | null>(
  null,
);

export function DeliveryProviderAccessProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const [memberRole, setMemberRole] = useState<DeliveryProviderMemberRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken) {
        setMemberRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const response = await getMyDeliveryProvider(accessToken);
        if (!cancelled) {
          setMemberRole((response.member_role as DeliveryProviderMemberRole | null) ?? null);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setMemberRole(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const value = useMemo<DeliveryProviderAccessContextValue>(
    () => ({
      loading,
      memberRole,
      memberRoleLabel: memberRoleLabel(memberRole),
      canManageMembers: canManageMembers(memberRole),
      canWriteProviderConfig: canWriteProviderConfig(memberRole),
      canManagePartnerships: canManagePartnerships(memberRole),
      canManageWeather: canManageWeather(memberRole),
      canSimulatePricing: canSimulatePricing(memberRole),
      isOperator: isOperatorRole(memberRole),
    }),
    [loading, memberRole],
  );

  return (
    <DeliveryProviderAccessContext.Provider value={value}>
      {children}
    </DeliveryProviderAccessContext.Provider>
  );
}

export function useDeliveryProviderAccess(): DeliveryProviderAccessContextValue {
  const context = useContext(DeliveryProviderAccessContext);
  if (!context) {
    throw new Error('useDeliveryProviderAccess must be used within DeliveryProviderAccessProvider');
  }
  return context;
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import styles from './RestaurantGate.module.css';

export function RestaurantGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, loading: authLoading } = useAuth();
  const {
    loading: accessLoading,
    selectedRestaurantId,
    loadError: accessError,
  } = useRestaurantAccess();

  useEffect(() => {
    if (authLoading || accessLoading) return;
    if (!accessToken) return;
    if (!selectedRestaurantId) {
      router.replace('/onboarding');
    }
  }, [accessLoading, accessToken, authLoading, router, selectedRestaurantId]);

  if (authLoading || accessLoading) {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        Cargando tu panel…
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        Cargando tu panel…
      </div>
    );
  }

  if (accessError && !selectedRestaurantId) {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        {accessError}
      </div>
    );
  }

  if (!selectedRestaurantId) {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        Redirigiendo al registro…
      </div>
    );
  }

  return <>{children}</>;
}

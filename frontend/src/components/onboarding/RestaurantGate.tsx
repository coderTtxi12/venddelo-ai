'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { listRestaurants } from '@/lib/api/restaurants';
import styles from './RestaurantGate.module.css';

export function RestaurantGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [hasRestaurant, setHasRestaurant] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (authLoading) return;

      if (!accessToken || !user) {
        if (!cancelled) {
          setChecking(false);
          setHasRestaurant(false);
        }
        return;
      }

      try {
        const page = await listRestaurants(accessToken, 1);
        const found = page.items.length > 0;
        if (!cancelled) {
          setHasRestaurant(found);
          if (!found) {
            router.replace('/onboarding');
          }
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setHasRestaurant(false);
          router.replace('/onboarding');
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [accessToken, authLoading, router, user]);

  if (authLoading || checking) {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        Cargando tu panel…
      </div>
    );
  }

  if (!hasRestaurant) {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        Redirigiendo al registro…
      </div>
    );
  }

  return <>{children}</>;
}

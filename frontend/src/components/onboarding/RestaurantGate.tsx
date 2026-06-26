'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { resolveSupplierIdByEmail } from '@/services/db';
import { legacyDb as db } from '@/services/legacyDb';
import styles from './RestaurantGate.module.css';

export function RestaurantGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [hasRestaurant, setHasRestaurant] = useState(false);
  const checkedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (authLoading) return;

      if (!accessToken || !user?.uid) {
        checkedTokenRef.current = null;
        if (!cancelled) {
          setChecking(false);
          setHasRestaurant(false);
        }
        return;
      }

      if (checkedTokenRef.current === accessToken) {
        if (!cancelled) setChecking(false);
        return;
      }

      try {
        const resolved = await resolveSupplierIdByEmail(
          db,
          user.email ?? '',
          accessToken,
        );
        const found = 'supplierId' in resolved;
        if (!cancelled) {
          checkedTokenRef.current = accessToken;
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
  }, [accessToken, authLoading, user?.uid, user?.email]);

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

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getMyDeliveryProvider } from '@/lib/api/deliveryProviders';
import styles from './ProviderGate.module.css';

type GateState = 'loading' | 'onboarding' | 'pending' | 'rejected' | 'active';

export function ProviderGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [gate, setGate] = useState<GateState>('loading');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (authLoading) return;

      if (!accessToken || !user) {
        if (!cancelled) setGate('loading');
        return;
      }

      try {
        const response = await getMyDeliveryProvider(accessToken);
        if (cancelled) return;

        const found = response.provider;

        if (!found) {
          setGate('onboarding');
          router.replace('/onboarding');
          return;
        }

        if (found.status === 'active') {
          setGate('active');
          return;
        }

        if (found.status === 'rejected') {
          setGate('rejected');
          router.replace('/pending-review');
          return;
        }

        if (found.status === 'pending_review' || found.status === 'draft') {
          setGate('pending');
          router.replace('/pending-review');
          return;
        }

        setGate('pending');
        router.replace('/pending-review');
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setGate('onboarding');
          router.replace('/onboarding');
        }
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [accessToken, authLoading, router, user]);

  if (authLoading || gate === 'loading') {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        Verificando acceso…
      </div>
    );
  }

  if (gate !== 'active') {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        Redirigiendo…
      </div>
    );
  }

  return <>{children}</>;
}

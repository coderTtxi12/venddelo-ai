'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PendingReviewPage } from '@/components/onboarding/PendingReviewPage';
import { useAuth } from '@/hooks/useAuth';
import { getMyDeliveryProvider } from '@/lib/api/deliveryProviders';
import type { DeliveryProvider } from '@/lib/api/types';

export default function PendingReviewRoute() {
  const router = useRouter();
  const { accessToken, loading } = useAuth();
  const [provider, setProvider] = useState<DeliveryProvider | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!accessToken) {
      router.replace('/login');
      return;
    }

    void getMyDeliveryProvider(accessToken)
      .then((response) => {
        if (!response.provider) {
          router.replace('/onboarding');
          return;
        }
        if (response.provider.status === 'active') {
          router.replace('/');
          return;
        }
        setProvider(response.provider);
      })
      .finally(() => setChecking(false));
  }, [accessToken, loading, router]);

  if (loading || checking) {
    return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>Cargando…</div>;
  }

  if (!provider) {
    return null;
  }

  return (
    <PendingReviewPage
      status={provider.status === 'rejected' ? 'rejected' : 'pending_review'}
    />
  );
}

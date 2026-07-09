'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import { useAuth } from '@/hooks/useAuth';
import { getMyDeliveryProvider } from '@/lib/api/deliveryProviders';

export default function OnboardingPage() {
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();

  useEffect(() => {
    if (loading || !accessToken) return;

    void getMyDeliveryProvider(accessToken).then((response) => {
      const provider = response.provider;
      if (!provider) return;
      if (provider.status === 'active') {
        router.replace('/partnerships');
        return;
      }
      router.replace('/pending-review');
    });
  }, [accessToken, loading, router]);

  if (loading || !user) {
    return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>Verificando sesión…</div>;
  }

  return (
    <OnboardingWizard
      userId={user.uid}
      onComplete={() => {
        router.replace('/pending-review');
        router.refresh();
      }}
    />
  );
}

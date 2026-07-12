'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import { useAuth } from '@/hooks/useAuth';
import { resolveMyRestaurantAccess } from '@/lib/api/restaurants';
import styles from './onboarding.module.css';

export default function OnboardingPage() {
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();

  useEffect(() => {
    if (loading || !accessToken) return;

    void resolveMyRestaurantAccess(accessToken, { userId: user.uid }).then((response) => {
      if (response.restaurant) {
        router.replace('/orders');
      }
    });
  }, [accessToken, loading, router]);

  if (loading || !user) {
    return <div className={styles.loading}>Verificando sesión…</div>;
  }

  return (
    <OnboardingWizard
      userId={user.uid}
      onComplete={() => {
        router.replace('/orders');
        router.refresh();
      }}
    />
  );
}

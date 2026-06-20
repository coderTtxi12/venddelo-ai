'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import { useAuth } from '@/hooks/useAuth';
import { listRestaurants } from '@/lib/api/restaurants';
import styles from './onboarding.module.css';

export default function OnboardingPage() {
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();

  useEffect(() => {
    if (loading || !accessToken) return;

    void listRestaurants(accessToken, 1).then((page) => {
      if (page.items.length > 0) {
        router.replace('/');
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
        router.replace('/');
        router.refresh();
      }}
    />
  );
}

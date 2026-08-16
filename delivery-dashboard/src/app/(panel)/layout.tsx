'use client';

import MainLayout from '@/layouts/MainLayout';
import { ProviderGate } from '@/components/onboarding/ProviderGate';
import { DeliveryProviderAccessProvider } from '@/contexts/DeliveryProviderAccessContext';
import { DeliveryZoneProvider } from '@/contexts/DeliveryZoneContext';

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProviderGate>
      <DeliveryProviderAccessProvider>
        <DeliveryZoneProvider>
          <MainLayout>{children}</MainLayout>
        </DeliveryZoneProvider>
      </DeliveryProviderAccessProvider>
    </ProviderGate>
  );
}

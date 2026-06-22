import MainLayout from '@/layouts/MainLayout';
import { ProviderGate } from '@/components/onboarding/ProviderGate';

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProviderGate>
      <MainLayout>{children}</MainLayout>
    </ProviderGate>
  );
}

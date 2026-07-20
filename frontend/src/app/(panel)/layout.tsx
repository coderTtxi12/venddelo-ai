import MainLayout from '@/layouts/MainLayout';
import { RestaurantGate } from '@/components/onboarding/RestaurantGate';
import { RestaurantAccessProvider } from '@/contexts/RestaurantAccessContext';

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RestaurantAccessProvider>
      <RestaurantGate>
        <MainLayout>{children}</MainLayout>
      </RestaurantGate>
    </RestaurantAccessProvider>
  );
}

import MainLayout from '@/layouts/MainLayout';
import { RestaurantGate } from '@/components/onboarding/RestaurantGate';

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RestaurantGate>
      <MainLayout>{children}</MainLayout>
    </RestaurantGate>
  );
}

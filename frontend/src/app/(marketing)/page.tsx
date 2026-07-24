import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Mexy AI',
  description: 'Gestiona el menú de tu restaurante por chat.',
};

export default function MarketingHomePage() {
  return <LandingPage />;
}

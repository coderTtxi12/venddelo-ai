import type { Metadata } from 'next';
import { TrackingAnimationShowcase } from '@/components/delivery/TrackingAnimationShowcase';

export const metadata: Metadata = {
  title: 'Muestras de animación de rastreo | Mexy',
  description: 'Exploración visual de los estados iniciales del rastreo de pedidos.',
};

export default function TrackingAnimationSamplesPage() {
  return <TrackingAnimationShowcase />;
}

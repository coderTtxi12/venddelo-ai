import type { Metadata } from 'next';
import { PublicTracking } from '@/components/delivery/PublicTracking';

export const metadata: Metadata = {
  title: 'Rastrea tu entrega | Mexy',
  description: 'Consulta el estado de tu entrega.',
};

type TrackingPageProps = {
  params: Promise<{ token: string }>;
};

export default async function TrackingPage({ params }: TrackingPageProps) {
  const { token } = await params;
  return <PublicTracking token={token} />;
}

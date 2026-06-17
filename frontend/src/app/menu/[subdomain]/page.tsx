import type { Metadata } from 'next';
import PublicDigitalMenuPage from '@/components/pages/PublicDigitalMenuPage';

type PageProps = {
  params: Promise<{ subdomain: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { subdomain } = await params;
  return {
    title: `${subdomain} · Menú`,
    description: 'Menú digital del restaurante',
  };
}

export default async function PublicMenuRoute({ params }: PageProps) {
  const { subdomain } = await params;
  return <PublicDigitalMenuPage subdomain={subdomain} />;
}

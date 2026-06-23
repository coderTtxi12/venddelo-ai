import type { Metadata } from 'next';
import PublicDigitalMenuPage from '@/components/pages/PublicDigitalMenuPage';
import { fetchPublicMenuCriticalData } from '@/lib/api/publicMenuServer';

type PageProps = {
  params: Promise<{ subdomain: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { subdomain } = await params;

  try {
    const { restaurant } = await fetchPublicMenuCriticalData(subdomain);
    return {
      title: `${restaurant.name} · Menú`,
      description: restaurant.description ?? 'Menú digital del restaurante',
    };
  } catch {
    return {
      title: `${subdomain} · Menú`,
      description: 'Menú digital del restaurante',
    };
  }
}

export default async function PublicMenuRoute({ params }: PageProps) {
  const { subdomain } = await params;

  try {
    const { restaurant, menu } = await fetchPublicMenuCriticalData(subdomain);
    return (
      <PublicDigitalMenuPage
        subdomain={subdomain}
        initialRestaurant={restaurant}
        initialMenu={menu}
      />
    );
  } catch {
    return <PublicDigitalMenuPage subdomain={subdomain} />;
  }
}

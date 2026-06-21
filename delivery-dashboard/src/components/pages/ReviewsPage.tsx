import { PanelPageShell } from '@/components/pages/PanelPageShell';
import styles from './MarketingPage.module.css';

export default function ReviewsPage() {
  return (
    <PanelPageShell
      title="Reseñas"
      subtitle="Monitorea la opinión de tus clientes y responde reseñas."
      styles={{
        page: styles.page,
        header: styles.header,
        title: styles.title,
        subtitle: styles.subtitle,
        empty: styles.empty,
        emptyTitle: styles.emptyTitle,
      }}
    />
  );
}

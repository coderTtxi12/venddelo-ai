import { PanelPageShell } from '@/components/pages/PanelPageShell';
import styles from './MarketingPage.module.css';

export default function AnalyticsPage() {
  return (
    <PanelPageShell
      title="Analíticas"
      subtitle="Métricas detalladas de rendimiento y tendencias."
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

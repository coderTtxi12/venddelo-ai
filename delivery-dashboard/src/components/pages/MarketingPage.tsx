import { PanelPageShell } from '@/components/pages/PanelPageShell';
import styles from './MarketingPage.module.css';

export default function MarketingPage() {
  return (
    <PanelPageShell
      title="Marketing"
      subtitle="Crea y administra promociones para impulsar tus ventas."
      styles={{
        page: styles.page,
        header: styles.header,
        title: styles.title,
        subtitle: styles.subtitle,
        empty: styles.empty,
        emptyTitle: styles.emptyTitle,
      }}
      action={
        <button type="button" className={styles.primaryBtn} disabled>
          + Nueva promoción
        </button>
      }
    />
  );
}

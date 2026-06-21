import { PanelPageShell } from '@/components/pages/PanelPageShell';
import styles from './DigitalMenuPage.module.css';

export default function DigitalMenuPage() {
  return (
    <PanelPageShell
      title="Menú Digital"
      subtitle="Previsualiza y personaliza el menú que verán tus clientes."
      styles={{
        page: styles.page,
        header: styles.header,
        title: styles.title,
        subtitle: styles.subtitle,
        empty: styles.emptyCategories,
        emptyTitle: styles.subtitle,
      }}
    />
  );
}

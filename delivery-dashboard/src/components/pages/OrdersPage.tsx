import { PanelPageShell } from '@/components/pages/PanelPageShell';
import styles from './MarketingPage.module.css';

export default function OrdersPage() {
  return (
    <PanelPageShell
      title="Órdenes"
      subtitle="Gestiona y da seguimiento a los pedidos en curso."
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

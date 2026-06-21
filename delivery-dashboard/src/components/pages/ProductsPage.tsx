import { PanelPageShell } from '@/components/pages/PanelPageShell';
import styles from './ProductsPage.module.css';

export default function ProductsPage() {
  return (
    <PanelPageShell
      title="Productos"
      subtitle="Administra tus productos, categorías y visibilidad en el catálogo."
      styles={{
        page: styles.page,
        header: styles.header,
        title: styles.title,
        subtitle: styles.subtitle,
        empty: styles.emptyState,
        emptyTitle: styles.emptyTitle,
        emptySubtitle: styles.emptySubtitle,
      }}
      action={
        <button type="button" className={styles.primaryBtn} disabled>
          + Nuevo producto
        </button>
      }
    />
  );
}

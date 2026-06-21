import { PanelPageShell } from '@/components/pages/PanelPageShell';
import styles from './SettingsPage.module.css';

export default function SettingsPage() {
  return (
    <PanelPageShell
      title="Configuración"
      subtitle="Perfil del negocio, horarios, ubicación y métodos de pago."
      styles={{
        page: styles.page,
        header: styles.header,
        title: styles.title,
        subtitle: styles.subtitle,
        empty: styles.empty,
        emptyTitle: styles.panelTitle,
      }}
      action={
        <button type="button" className={styles.primaryBtn} disabled>
          Guardar cambios
        </button>
      }
    />
  );
}

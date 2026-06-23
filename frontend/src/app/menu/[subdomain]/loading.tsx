import styles from '@/components/pages/PublicDigitalMenuPage.module.css';

export default function PublicMenuLoading() {
  return (
    <div className={styles.publicShell}>
      <p className={styles.stateText}>Cargando menú…</p>
    </div>
  );
}

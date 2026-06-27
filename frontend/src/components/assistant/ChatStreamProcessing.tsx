import styles from './ChatStreamProcessing.module.css';

export default function ChatStreamProcessing() {
  return (
    <span className={styles.processing} aria-label="El asistente está procesando">
      <span className={styles.dots} aria-hidden>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </span>
    </span>
  );
}

import styles from './ChatStreamProcessing.module.css';

export default function ChatStreamProcessing({ label }: { label?: string }) {
  return (
    <span className={styles.processing} aria-label={label ?? 'El asistente está procesando'}>
      {label ? <span className={styles.phaseLabel}>{label}</span> : null}
      <span className={styles.dots} aria-hidden>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </span>
    </span>
  );
}

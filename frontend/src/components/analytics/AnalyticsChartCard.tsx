import type { ReactNode } from 'react';
import styles from './AnalyticsChartCard.module.css';

type AnalyticsChartCardProps = {
  title: string;
  subtitle?: string;
  help?: string;
  children: ReactNode;
  fullWidth?: boolean;
};

export default function AnalyticsChartCard({
  title,
  subtitle,
  help,
  children,
  fullWidth = false,
}: AnalyticsChartCardProps) {
  return (
    <article className={`${styles.card} ${fullWidth ? styles.fullWidth : ''}`}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {help && <p className={styles.help}>{help}</p>}
      </header>
      <div className={styles.body}>{children}</div>
    </article>
  );
}

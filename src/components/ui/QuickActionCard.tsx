import type { KeyboardEvent } from 'react';
import styles from './QuickActionCard.module.css';

interface QuickActionCardProps {
  title: string;
  description: string;
  className?: string;
  onClick?: () => void;
}

export default function QuickActionCard({
  title,
  description,
  className,
  onClick,
}: QuickActionCardProps) {
  function handleKeyDown(e: KeyboardEvent) {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      className={`${styles.card} ${className ?? ''}`.trim()}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className={styles.title}>{title}</span>
      <span className={styles.description}>{description}</span>
      <span className={styles.arrow}>↗</span>
    </div>
  );
}


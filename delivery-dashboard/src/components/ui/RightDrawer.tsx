'use client';

import { useEffect, type ReactNode } from 'react';
import styles from './RightDrawer.module.css';

type RightDrawerProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'default' | 'narrow';
};

export function RightDrawer({ open, title, onClose, children, size = 'default' }: RightDrawerProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={`${styles.drawer}${size === 'narrow' ? ` ${styles.drawerNarrow}` : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}

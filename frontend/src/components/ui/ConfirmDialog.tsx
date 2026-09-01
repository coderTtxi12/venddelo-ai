'use client';

import { useEffect, useRef } from 'react';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  stepHint?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  variant?: 'danger' | 'primary' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

function confirmClassName(variant: ConfirmDialogProps['variant']): string {
  if (variant === 'primary') return styles.confirmPrimary;
  if (variant === 'warning') return styles.confirmWarning;
  return styles.confirmBtn;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  stepHint,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  loading = false,
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) onCancel();
    }
    window.addEventListener('keydown', onKey);
    const focusTarget = variant === 'warning' ? cancelRef.current : dialogRef.current;
    focusTarget?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onCancel, open, variant]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={loading ? undefined : onCancel}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        tabIndex={-1}
      >
        {stepHint ? <p className={styles.stepHint}>{stepHint}</p> : null}
        <h2 id="confirm-dialog-title" className={styles.title}>
          {title}
        </h2>
        <p id="confirm-dialog-desc" className={styles.body}>
          {description}
        </p>
        <div className={styles.actions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmClassName(variant)}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

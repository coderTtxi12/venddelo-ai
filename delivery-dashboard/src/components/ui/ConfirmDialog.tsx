'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './ConfirmDialog.module.css';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: ReactNode;
  stepHint?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirming?: boolean;
  confirmDisabled?: boolean;
  variant?: 'danger' | 'primary' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
};

function confirmClassName(variant: ConfirmDialogProps['variant']): string {
  if (variant === 'primary') return styles.confirmPrimary;
  if (variant === 'warning') return styles.confirmWarning;
  return styles.confirmBtn;
}

export function ConfirmDialog({
  open,
  title,
  body,
  stepHint,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirming = false,
  confirmDisabled = false,
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !confirming) onCancel();
    }
    window.addEventListener('keydown', onKey);
    const focusTarget = variant === 'warning' ? cancelRef.current : dialogRef.current;
    focusTarget?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, onCancel, open, variant]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !confirming) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        tabIndex={-1}
      >
        {stepHint ? <p className={styles.stepHint}>{stepHint}</p> : null}
        <h2 id="confirm-title" className={styles.title}>
          {title}
        </h2>
        <div id="confirm-body" className={styles.body}>
          {body}
        </div>
        <div className={styles.actions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.cancelBtn}
            disabled={confirming}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmClassName(variant)}
            disabled={confirming || confirmDisabled}
            onClick={onConfirm}
          >
            {confirming ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

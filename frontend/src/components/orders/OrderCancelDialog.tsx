'use client';

import { useEffect, useState } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import styles from './OrderCancelDialog.module.css';
import { KITCHEN_CANCEL_REASONS, type KitchenCancelReason } from '@/lib/orders/kitchenWhatsApp';

export function OrderCancelDialog({
  open,
  orderLabel,
  onClose,
  onConfirm,
  confirming,
}: {
  open: boolean;
  orderLabel: string;
  onClose: () => void;
  onConfirm: (reason: KitchenCancelReason) => void;
  confirming: boolean;
}) {
  const [selectedReason, setSelectedReason] = useState<KitchenCancelReason | null>(null);

  useEffect(() => {
    if (!open) setSelectedReason(null);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !confirming) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, onClose, open]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={() => {
        if (!confirming) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-order-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <h2 id="cancel-order-title" className={styles.title}>
              Cancelar pedido
            </h2>
            <p className={styles.subtitle}>{orderLabel}</p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Cerrar"
            disabled={confirming}
            onClick={onClose}
          >
            <CloseIcon fontSize="small" />
          </button>
        </header>

        <p className={styles.prompt} id="cancel-reason-prompt">
          Elige el motivo. Revisa y confirma para no cancelar por error.
        </p>

        <div
          className={styles.reasonList}
          role="radiogroup"
          aria-labelledby="cancel-reason-prompt"
        >
          {KITCHEN_CANCEL_REASONS.map((reason) => {
            const selected = selectedReason === reason;
            return (
              <button
                key={reason}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`${styles.reasonBtn}${selected ? ` ${styles.reasonBtnSelected}` : ''}`}
                disabled={confirming}
                onClick={() => setSelectedReason(reason)}
              >
                {reason}
              </button>
            );
          })}
        </div>

        {selectedReason ? (
          <div className={styles.confirmFooter}>
            <p className={styles.confirmHint}>
              El pedido se cancelará por «{selectedReason}». Esta acción no se puede deshacer.
            </p>
            <button
              type="button"
              className={styles.confirmBtn}
              disabled={confirming}
              onClick={() => onConfirm(selectedReason)}
            >
              {confirming ? 'Cancelando…' : 'Confirmar cancelación'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

'use client';

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
  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
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
          <button type="button" className={styles.closeBtn} aria-label="Cerrar" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </button>
        </header>

        <p className={styles.prompt}>Elige el motivo para el cliente:</p>

        <div className={styles.reasonList}>
          {KITCHEN_CANCEL_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              className={styles.reasonBtn}
              disabled={confirming}
              onClick={() => onConfirm(reason)}
            >
              {reason}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

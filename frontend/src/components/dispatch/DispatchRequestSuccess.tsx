'use client';

import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useEffect, useMemo, useState } from 'react';
import {
  formatDispatchShortId,
  isDispatchHistoryStatus,
  type DispatchRequest,
} from '@/lib/api/dispatch';
import { formatMoney } from '@/lib/currency';
import { publicMenuOrigin } from '@/lib/restaurantSubdomain';
import styles from './DispatchRequestSuccess.module.css';

function shareTrackingWhatsApp(shortId: string, url: string) {
  const text = `Rastrea tu entrega ${shortId}\n${url}`;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer',
  );
}

export function DispatchRequestSuccess({
  request,
  subdomain,
  onDismiss,
}: {
  request: DispatchRequest;
  subdomain: string;
  onDismiss: () => void;
}) {
  const [copiedTracking, setCopiedTracking] = useState(false);
  const trackingUrl = `${publicMenuOrigin(subdomain)}/rastreo/${request.tracking_token}`;

  useEffect(() => {
    setCopiedTracking(false);
  }, [request.id, request.short_id]);
  const isOpen = !isDispatchHistoryStatus(request.status);

  const searchLabel = useMemo(
    () =>
      new Date(request.search_at).toLocaleString('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [request.search_at],
  );

  async function copyCreatedTracking() {
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopiedTracking(true);
      window.setTimeout(() => setCopiedTracking(false), 2000);
    } catch {
      window.prompt('Copia el enlace de rastreo', trackingUrl);
    }
  }

  if (!isOpen) return null;

  return (
    <section className={styles.success} aria-live="polite">
      <div className={styles.successMark} aria-hidden>
        <CheckOutlinedIcon fontSize="small" />
      </div>
      <div className={styles.successBody}>
        <div className={styles.successHeading}>
          <h2>Pedido {formatDispatchShortId(request.short_id)} solicitado</h2>
          <button
            type="button"
            className={styles.successDismiss}
            aria-label="Cerrar aviso"
            onClick={onDismiss}
          >
            <CloseOutlinedIcon sx={{ fontSize: 18 }} />
          </button>
        </div>
        <p className={styles.successMeta}>Búsqueda {searchLabel}</p>
        <p className={styles.successCosts}>
          {request.payment_method === 'transfer' ? (
            <span>Envío {formatMoney(request.quoted_fee_cents / 100, 'MXN')}</span>
          ) : (
            <>
              <span>Restaurante {formatMoney(request.collect_cents / 100, 'MXN')}</span>
              <span aria-hidden>·</span>
              <span>Envío {formatMoney(request.quoted_fee_cents / 100, 'MXN')}</span>
            </>
          )}
        </p>
        <div className={styles.successActions}>
          <button type="button" className={styles.successAction} onClick={() => void copyCreatedTracking()}>
            {copiedTracking ? <CheckOutlinedIcon fontSize="small" /> : <ContentCopyOutlinedIcon fontSize="small" />}
            {copiedTracking ? 'Enlace copiado' : 'Copiar rastreo'}
          </button>
          <button
            type="button"
            className={`${styles.successAction} ${styles.successWhatsApp}`}
            onClick={() => shareTrackingWhatsApp(formatDispatchShortId(request.short_id), trackingUrl)}
          >
            <WhatsAppIcon fontSize="small" />
            WhatsApp
          </button>
          <a className={styles.successAction} href={trackingUrl} target="_blank" rel="noreferrer">
            <OpenInNewOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
            Abrir rastreo
          </a>
        </div>
      </div>
    </section>
  );
}

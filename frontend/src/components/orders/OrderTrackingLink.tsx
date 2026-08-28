'use client';

import { useState } from 'react';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { formatDispatchShortId } from '@/lib/api/dispatch';
import styles from './OrdersKitchen.module.css';

function shareTrackingWhatsApp(shortId: string, url: string) {
  const text = `Rastrea tu entrega ${shortId}\n${url}`;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer',
  );
}

export function OrderTrackingLink({
  trackingUrl,
  shortId,
}: {
  trackingUrl: string;
  shortId: string;
}) {
  const [copied, setCopied] = useState(false);
  const label = formatDispatchShortId(shortId) || 'envío';

  async function copyTracking() {
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copia el enlace de rastreo', trackingUrl);
    }
  }

  return (
    <div className={`${styles.infoCard} ${styles.infoCardWide}`}>
      <p className={styles.infoLabel}>Rastreo</p>
      <p className={styles.infoValue}>Enlace para el cliente</p>
      <div className={styles.trackingActions}>
        <button
          type="button"
          className={styles.trackingAction}
          onClick={() => void copyTracking()}
        >
          {copied ? <CheckOutlinedIcon fontSize="small" /> : <ContentCopyOutlinedIcon fontSize="small" />}
          {copied ? 'Enlace copiado' : 'Copiar enlace'}
        </button>
        <button
          type="button"
          className={`${styles.trackingAction} ${styles.trackingWhatsApp}`}
          onClick={() => shareTrackingWhatsApp(label, trackingUrl)}
        >
          <WhatsAppIcon fontSize="small" />
          WhatsApp
        </button>
        <a
          className={styles.trackingAction}
          href={trackingUrl}
          target="_blank"
          rel="noreferrer"
        >
          <OpenInNewOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
          Abrir rastreo
        </a>
      </div>
    </div>
  );
}

'use client';

import type { KitchenSocketConnectionStatus } from '@/lib/orders/useKitchenOrdersSocket';
import styles from './OrdersKitchen.module.css';

type KitchenLiveIndicatorProps = {
  status: KitchenSocketConnectionStatus;
};

const STATUS_COPY: Record<
  KitchenSocketConnectionStatus,
  { label: string; hint: string; tone: 'live' | 'pending' | 'muted' }
> = {
  live: {
    label: 'En vivo',
    hint: 'Los pedidos se actualizan automáticamente',
    tone: 'live',
  },
  connecting: {
    label: 'Conectando',
    hint: 'Estableciendo enlace en tiempo real',
    tone: 'pending',
  },
  reconnecting: {
    label: 'Reconectando',
    hint: 'Sincronizando pedidos al restablecer la conexión',
    tone: 'pending',
  },
  offline: {
    label: 'Sin enlace',
    hint: 'No hay conexión en tiempo real',
    tone: 'muted',
  },
};

export function KitchenLiveIndicator({ status }: KitchenLiveIndicatorProps) {
  const copy = STATUS_COPY[status];
  const dotClassName =
    copy.tone === 'live'
      ? styles.liveDotLive
      : copy.tone === 'pending'
        ? styles.liveDotPending
        : styles.liveDotMuted;

  return (
    <div
      className={styles.liveIndicator}
      role="status"
      aria-live="polite"
      aria-label={`${copy.label}. ${copy.hint}`}
      title={copy.hint}
    >
      <span className={`${styles.liveDot} ${dotClassName}`} aria-hidden />
      <span className={styles.liveLabel}>{copy.label}</span>
    </div>
  );
}

'use client';

import { useServiceStatus } from '@/hooks/useServiceStatus';
import type { DeliveryProviderServiceStatusReason } from '@/lib/api/types';
import styles from './ServiceStatusToggle.module.css';

function statusCopy(
  statusReason: DeliveryProviderServiceStatusReason,
  serviceActive: boolean,
): { label: string; hint: string } {
  if (serviceActive) {
    return { label: 'Servicio activo', hint: 'Recibiendo pedidos' };
  }

  switch (statusReason) {
    case 'manual_off':
      return { label: 'Servicio inactivo', hint: 'Pausado manualmente' };
    case 'outside_schedule':
      return { label: 'Servicio inactivo', hint: 'Fuera de horario de reparto' };
    default:
      return { label: 'Servicio inactivo', hint: 'No disponible' };
  }
}

export default function ServiceStatusToggle() {
  const { status, loading, saving, setManuallyEnabled } = useServiceStatus();

  if (loading) {
    return (
      <div className={styles.toggleWrap} aria-busy="true">
        <span className={styles.loadingText}>Estado del servicio…</span>
      </div>
    );
  }

  if (!status) return null;

  const copy = statusCopy(status.status_reason, status.service_active);
  const dotClass = saving
    ? styles.statusDotPending
    : status.service_active
      ? styles.statusDotActive
      : styles.statusDotInactive;

  return (
    <div className={styles.toggleWrap}>
      <div className={styles.statusMeta}>
        <div className={styles.statusRow}>
          <span className={`${styles.statusDot} ${dotClass}`} aria-hidden />
          <span className={styles.statusLabel}>{copy.label}</span>
        </div>
        <span className={styles.statusHint}>{saving ? 'Guardando en el servidor…' : copy.hint}</span>
      </div>

      <label className={styles.switch}>
        <input
          type="checkbox"
          checked={status.manually_enabled}
          disabled={saving}
          aria-label="Activar o pausar servicio de reparto"
          onChange={(event) => {
            void setManuallyEnabled(event.target.checked);
          }}
        />
        <span className={styles.slider} aria-hidden />
      </label>
    </div>
  );
}

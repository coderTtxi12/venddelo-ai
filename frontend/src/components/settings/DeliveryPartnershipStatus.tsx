'use client';

import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import {
  DELIVERY_PARTNERSHIP_STATUS_LABELS,
  getDeliveryPartnershipStatusHint,
} from '@/lib/deliveryPartnership';
import type { RestaurantDeliveryPartnership } from '@/lib/api/types';
import styles from './DeliveryPartnershipStatus.module.css';

type DeliveryPartnershipStatusProps = {
  partnership: RestaurantDeliveryPartnership | null;
  deliveryEnabled?: boolean;
  loading?: boolean;
  requestError?: string | null;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function badgeClass(status: RestaurantDeliveryPartnership['status']): string {
  switch (status) {
    case 'active':
      return styles.badgeActive;
    case 'suspended':
      return styles.badgeSuspended;
    case 'pending':
    default:
      return styles.badgePending;
  }
}

export function DeliveryPartnershipStatus({
  partnership,
  deliveryEnabled = false,
  loading = false,
  requestError = null,
}: DeliveryPartnershipStatusProps) {
  if (loading) {
    return (
      <div className={styles.empty} aria-live="polite">
        <p className={styles.emptyTitle}>Enviando solicitud a Mexy Reparto…</p>
      </div>
    );
  }

  if (!partnership) {
    if (requestError) {
      return (
        <div className={styles.empty} aria-label="Estado del courier">
          <p className={styles.emptyTitle}>No se pudo enviar la solicitud</p>
          <p className={styles.emptyText}>{requestError}</p>
        </div>
      );
    }

    if (deliveryEnabled) {
      return (
        <div className={styles.empty} aria-label="Estado del courier">
          <p className={styles.emptyTitle}>Sin cobertura de Mexy</p>
          <p className={styles.emptyText}>
            Aún no hay una zona de Mexy que cubra tu ubicación. Puedes mantener delivery activo y
            volver a intentar más tarde.
          </p>
        </div>
      );
    }

    return (
      <div className={styles.empty} aria-label="Estado del courier">
        <p className={styles.emptyTitle}>Solicitud pendiente de envío</p>
        <p className={styles.emptyText}>
          Guarda la configuración con entrega a domicilio activa para enviar tu solicitud a Mexy
          Reparto.
        </p>
      </div>
    );
  }

  const providerHeading = [partnership.provider_name, partnership.zone_name]
    .filter(Boolean)
    .join(' · ');

  const dateLabel =
    partnership.status === 'active' && partnership.activated_at
      ? `Aprobada el ${formatDate(partnership.activated_at)}`
      : `Solicitada el ${formatDate(partnership.created_at)}`;

  return (
    <article className={styles.page} aria-label="Estado del courier de reparto">
      <span className={styles.iconWrap} aria-hidden>
        {partnership.status === 'pending' ? (
          <ScheduleOutlinedIcon sx={{ fontSize: 20 }} />
        ) : (
          <LocalShippingOutlinedIcon sx={{ fontSize: 20 }} />
        )}
      </span>
      <div className={styles.body}>
        <div className={styles.headerRow}>
          <h3 className={styles.providerName}>{providerHeading}</h3>
          <span className={`${styles.badge} ${badgeClass(partnership.status)}`}>
            {DELIVERY_PARTNERSHIP_STATUS_LABELS[partnership.status]}
          </span>
        </div>
        <p className={styles.hint}>
          {getDeliveryPartnershipStatusHint(partnership.status, partnership.zone_name)}
        </p>
        <p className={styles.meta}>{dateLabel}</p>
      </div>
    </article>
  );
}

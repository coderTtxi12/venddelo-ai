'use client';

import DeliveryDiningOutlinedIcon from '@mui/icons-material/DeliveryDiningOutlined';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import { useCallback, useEffect, useState } from 'react';
import { WhatsAppIcon } from '@/components/digital-menu/SocialBrandIcons';
import {
  getPublicDispatchTracking,
  type DispatchStatus,
  type PublicDispatchTracking,
  formatDispatchShortId,
} from '@/lib/api/dispatch';
import { ApiError } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import { applyTrackingLocation } from '@/lib/dispatch/publicTrackingRealtime';
import {
  usePublicTrackingRealtime,
  type PublicTrackingRealtimeStatus,
} from '@/lib/dispatch/usePublicTrackingRealtime';
import { PublicTrackingMap } from './PublicTrackingMap';
import styles from './PublicTracking.module.css';

const STATUS_COPY: Record<DispatchStatus, { title: string; detail: string }> = {
  scheduled: {
    title: 'Cocinando tu pedido',
    detail: 'El restaurante está preparando tu comida. Después buscaremos un repartidor.',
  },
  searching: {
    title: 'Buscando repartidor',
    detail: 'Estamos buscando al mejor repartidor disponible para tu entrega.',
  },
  offered: {
    title: 'Contactando a un repartidor',
    detail: 'Un repartidor está revisando la solicitud.',
  },
  assigned: {
    title: 'Repartidor asignado',
    detail: 'El repartidor se dirige al restaurante.',
  },
  picked_up: {
    title: 'Pedido recogido',
    detail: 'El repartidor ya tiene tu pedido.',
  },
  in_transit: {
    title: 'Tu entrega va en camino',
    detail: 'El repartidor se dirige a la ubicación de entrega.',
  },
  delivered: {
    title: 'Entregado',
    detail: 'Tu pedido llegó a destino.',
  },
  unassigned: {
    title: 'Aún no encontramos repartidor',
    detail: 'El restaurante puede volver a intentar la búsqueda.',
  },
  cancelled: {
    title: 'Entrega cancelada',
    detail: 'Esta solicitud fue cancelada.',
  },
};

const TIMELINE_STEPS = [
  {
    id: 'cooking',
    label: 'Cocinando',
    hint: 'El restaurante prepara tu pedido.',
  },
  {
    id: 'searching',
    label: 'Buscando repartidor',
    hint: 'El sistema busca al repartidor más cercano.',
  },
  {
    id: 'assigned',
    label: 'Repartidor asignado',
    hint: 'Va rumbo al restaurante a recoger.',
  },
  {
    id: 'picked_up',
    label: 'Pedido recogido',
    hint: 'El repartidor ya tiene tu paquete.',
  },
  {
    id: 'in_transit',
    label: 'En camino',
    hint: 'Se dirige a tu ubicación.',
  },
  {
    id: 'delivered',
    label: 'Entregado',
    hint: 'Tu pedido llegó a destino.',
  },
] as const;

type StepState = 'complete' | 'current' | 'upcoming' | 'failed';

function timelineIndex(status: DispatchStatus): number {
  switch (status) {
    case 'scheduled':
      return 0;
    case 'searching':
    case 'offered':
    case 'unassigned':
      return 1;
    case 'assigned':
      return 2;
    case 'picked_up':
      return 3;
    case 'in_transit':
      return 4;
    case 'delivered':
      return 5;
    case 'cancelled':
      return -1;
  }
}

function stepState(
  index: number,
  status: DispatchStatus,
): StepState {
  const current = timelineIndex(status);
  if (status === 'cancelled') {
    return 'upcoming';
  }
  if (status === 'unassigned' && index === 1) {
    return 'failed';
  }
  if (current < 0) {
    return 'upcoming';
  }
  if (index < current) return 'complete';
  if (index === current) return 'current';
  return 'upcoming';
}

function icon(status: DispatchStatus) {
  if (status === 'delivered') return <DoneAllOutlinedIcon />;
  if (status === 'scheduled') return <RestaurantOutlinedIcon />;
  if (status === 'searching' || status === 'offered') {
    return <DeliveryDiningOutlinedIcon />;
  }
  if (status === 'cancelled' || status === 'unassigned') {
    return <ErrorOutlineOutlinedIcon />;
  }
  return <LocalShippingOutlinedIcon />;
}

const PAYMENT_LABELS: Record<PublicDispatchTracking['payment_method'], string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card_terminal: 'Terminal',
};

const MOTORCYCLE_COLOR_HEX: Record<string, string> = {
  negro: '#111827',
  blanco: '#F8FAFC',
  rojo: '#DC2626',
  azul: '#1D4ED8',
  gris: '#64748B',
  plata: '#94A3B8',
  verde: '#15803D',
  amarillo: '#CA8A04',
  naranja: '#EA580C',
  cafe: '#92400E',
  café: '#92400E',
  morado: '#7C3AED',
};

function motorcycleColorHex(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  return MOTORCYCLE_COLOR_HEX[trimmed.toLowerCase()] ?? '#2563EB';
}

function vehicleTypeLabel(type: string): string {
  return type === 'moto' ? 'Moto' : type;
}

function formatCents(cents: number): string {
  return formatMoney(cents / 100, 'MXN');
}

function riderPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

function riderTelHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = riderPhoneDigits(trimmed);
  if (digits.length < 8) return null;
  return trimmed.startsWith('+') ? `tel:${trimmed.replace(/\s/g, '')}` : `tel:+${digits}`;
}

function riderWhatsAppHref(phone: string, firstName: string, shortId: string): string | null {
  const digits = riderPhoneDigits(phone);
  if (digits.length < 8) return null;
  const text = encodeURIComponent(
    `Hola ${firstName}, te escribo por la entrega ${formatDispatchShortId(shortId)}.`,
  );
  return `https://wa.me/${digits}?text=${text}`;
}

function RiderPhoto({
  url,
  firstName,
}: {
  url: string | null;
  firstName: string;
}) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <span className={styles.riderPhotoFallback} aria-hidden>
        {firstName.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={`Foto de ${firstName}`}
      className={styles.riderPhoto}
      onError={() => setBroken(true)}
    />
  );
}

function TrackingTimeline({ status }: { status: DispatchStatus }) {
  return (
    <ol className={styles.timeline} aria-label="Estado del paquete">
      {TIMELINE_STEPS.map((step, index) => {
        const state = stepState(index, status);
        return (
          <li
            key={step.id}
            className={`${styles.timelineItem} ${styles[`step_${state}`]}`}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.timelineMarker} aria-hidden />
            <div className={styles.timelineCopy}>
              <p className={styles.timelineLabel}>{step.label}</p>
              <p className={styles.timelineHint}>{step.hint}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function PublicTracking({ token }: { token: string }) {
  const [tracking, setTracking] = useState<PublicDispatchTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [socketStatus, setSocketStatus] = useState<PublicTrackingRealtimeStatus>('connecting');

  const refresh = useCallback(async () => {
    try {
      const result = await getPublicDispatchTracking(token);
      setTracking(result);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError && loadError.httpStatus === 404
          ? 'No encontramos este enlace de rastreo.'
          : 'No se pudo actualizar el estado de la entrega.',
      );
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePublicTrackingRealtime(token, tracking?.status ?? null, {
    onStatusChange: setSocketStatus,
    onReconnect: () => {
      void refresh();
    },
    onEvent: (event) => {
      if (event.type === 'tracking.updated') {
        void refresh();
        return;
      }
      setTracking((current) =>
        current ? applyTrackingLocation(current, event) : current,
      );
    },
  });

  const liveStatus = tracking?.status ?? null;
  const showLive =
    liveStatus != null && liveStatus !== 'delivered' && liveStatus !== 'cancelled';

  useEffect(() => {
    if (!showLive) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (socketStatus === 'live') return;
    const interval = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(interval);
  }, [refresh, showLive, socketStatus]);

  if (error && !tracking) {
    return (
      <main className={styles.shell}>
        <section className={styles.error} role="alert">
          <ErrorOutlineOutlinedIcon />
          <h1>Rastreo no disponible</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!tracking) {
    return (
      <main className={styles.shell}>
        <p className={styles.loading}>Cargando rastreo…</p>
      </main>
    );
  }

  const copy = STATUS_COPY[tracking.status];
  const delivered = tracking.status === 'delivered';
  const restaurantName = tracking.restaurant_name ?? tracking.pickup?.name ?? null;
  const live = socketStatus === 'live';
  const telHref = !delivered && tracking.rider ? riderTelHref(tracking.rider.phone) : null;
  const whatsappHref =
    !delivered && tracking.rider
      ? riderWhatsAppHref(
          tracking.rider.phone,
          tracking.rider.first_name,
          tracking.short_id,
        )
      : null;
  const detailsVisible = delivered || detailsOpen;

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div className={styles.brandRow}>
          <div className={styles.brand}>Mexy Delivery</div>
          {showLive ? (
            <span className={`${styles.liveBadge} ${live ? styles.liveBadgeOn : ''}`}>
              <span className={styles.liveDot} aria-hidden />
              {live ? 'En vivo' : 'Actualizando'}
            </span>
          ) : null}
        </div>
        <div className={`${styles.status}${delivered ? ` ${styles.statusDelivered}` : ''}`}>
          <span className={styles.icon}>{icon(tracking.status)}</span>
          <div aria-live="polite">
            <p className={styles.eyebrow}>Envío {formatDispatchShortId(tracking.short_id)}</p>
            <h1>{copy.title}</h1>
            <p>{copy.detail}</p>
          </div>
        </div>

        <dl className={styles.parties}>
          {restaurantName ? (
            <div className={styles.party}>
              <dt>
                <RestaurantOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
                Restaurante
              </dt>
              <dd>{restaurantName}</dd>
            </div>
          ) : null}
          <div className={styles.party}>
            <dt>
              <PersonOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
              Cliente
            </dt>
            <dd>{tracking.customer_name}</dd>
          </div>
        </dl>

        {delivered ? null : <TrackingTimeline status={tracking.status} />}

        {!delivered && tracking.rider ? (
          <article className={styles.riderCard} aria-label="Datos del repartidor">
            <RiderPhoto
              url={tracking.rider.photo_url}
              firstName={tracking.rider.first_name}
            />
            <div className={styles.riderBody}>
              <p className={styles.riderName}>{tracking.rider.first_name}</p>
              <p className={styles.riderVehicle}>
                {vehicleTypeLabel(tracking.rider.vehicle_type)}
                {tracking.rider.motorcycle_brand
                  ? ` · ${tracking.rider.motorcycle_brand}`
                  : ''}
                {tracking.rider.motorcycle_color ? (
                  <>
                    {' · '}
                    <span className={styles.riderColor}>
                      <span
                        className={styles.colorDot}
                        style={{
                          background: motorcycleColorHex(
                            tracking.rider.motorcycle_color,
                          ),
                        }}
                        aria-hidden
                      />
                      {tracking.rider.motorcycle_color}
                    </span>
                  </>
                ) : null}
              </p>
              <p className={styles.riderPlate}>
                Placas {tracking.rider.plate_suffix ? `···${tracking.rider.plate_suffix}` : '—'}
              </p>
              {tracking.eta_seconds != null ? (
                <p className={styles.riderEta}>
                  {tracking.status === 'assigned'
                    ? `Al restaurante aprox. ${Math.max(1, Math.ceil(tracking.eta_seconds / 60))} min`
                    : `Llegada aprox. ${Math.max(1, Math.ceil(tracking.eta_seconds / 60))} min`}
                </p>
              ) : null}
            </div>
            {telHref || whatsappHref ? (
              <div className={styles.riderActions}>
                {telHref ? (
                  <a
                    href={telHref}
                    className={`${styles.riderAction} ${styles.riderActionCall}`}
                    aria-label={`Llamar a ${tracking.rider.first_name}`}
                  >
                    <PhoneOutlinedIcon sx={{ fontSize: 20 }} aria-hidden />
                    Llamar
                  </a>
                ) : null}
                {whatsappHref ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.riderAction} ${styles.riderActionWhatsApp}`}
                    aria-label={`WhatsApp a ${tracking.rider.first_name}`}
                  >
                    <WhatsAppIcon className={styles.riderActionIcon} />
                    WhatsApp
                  </a>
                ) : null}
              </div>
            ) : null}
          </article>
        ) : null}

        <div className={styles.details}>
          {delivered ? (
            <h2 className={styles.detailsHeading}>Detalles del pedido</h2>
          ) : (
            <button
              type="button"
              className={styles.detailsToggle}
              aria-expanded={detailsOpen}
              aria-controls="order-details-panel"
              onClick={() => setDetailsOpen((open) => !open)}
            >
              <span>{detailsOpen ? 'Ocultar detalles del pedido' : 'Ver detalles del pedido'}</span>
              <span
                className={`${styles.detailsChevron} ${detailsOpen ? styles.detailsChevronOpen : ''}`}
                aria-hidden
              >
                <ExpandMoreOutlinedIcon sx={{ fontSize: 22 }} />
              </span>
            </button>
          )}
          <div
            id="order-details-panel"
            className={styles.detailsPanel}
            hidden={!detailsVisible}
          >
            {restaurantName ? (
              <div className={styles.detailRow}>
                <span>Restaurante</span>
                <strong>{restaurantName}</strong>
              </div>
            ) : null}
            <div className={styles.detailRow}>
              <span>Cliente</span>
              <strong>{tracking.customer_name}</strong>
            </div>
            <div className={styles.detailRow}>
              <span>Paquetes</span>
              <strong>
                {tracking.package_count}{' '}
                {tracking.package_count === 1 ? 'paquete' : 'paquetes'}
              </strong>
            </div>
            <div className={styles.detailRow}>
              <span>Forma de pago</span>
              <strong>{PAYMENT_LABELS[tracking.payment_method]}</strong>
            </div>
            {tracking.collect_cents != null &&
            (tracking.payment_method === 'cash' ||
              tracking.payment_method === 'card_terminal') ? (
              <div className={styles.detailRow}>
                <span>
                  {tracking.payment_method === 'card_terminal'
                    ? 'Monto a cobrar en terminal'
                    : 'Monto a pagar'}
                </span>
                <strong>{formatCents(tracking.collect_cents)}</strong>
              </div>
            ) : null}
            {tracking.payment_method === 'cash' &&
            tracking.cash_denomination_cents != null ? (
              <div className={styles.detailRow}>
                <span>Paga con</span>
                <strong>{formatCents(tracking.cash_denomination_cents)}</strong>
              </div>
            ) : null}
            {tracking.payment_method === 'cash' &&
            tracking.collect_cents != null &&
            tracking.cash_denomination_cents != null &&
            tracking.cash_denomination_cents > tracking.collect_cents ? (
              <div className={styles.detailRow}>
                <span>Cambio</span>
                <strong>
                  {formatCents(
                    tracking.cash_denomination_cents - tracking.collect_cents,
                  )}
                </strong>
              </div>
            ) : null}
          </div>
        </div>

        {delivered ? null : <PublicTrackingMap tracking={tracking} />}
        <div className={styles.address}>
          <strong>Destino</strong>
          <span>{tracking.dropoff.address}</span>
        </div>
      </section>
    </main>
  );
}

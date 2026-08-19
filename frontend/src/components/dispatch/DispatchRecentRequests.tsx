'use client';

import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useState } from 'react';
import { DispatchCostBreakdown } from '@/components/dispatch/DispatchCostBreakdown';
import {
  formatDispatchShortId,
  type DispatchAssignedRider,
  type DispatchRequest,
  type DispatchStatus,
} from '@/lib/api/dispatch';
import {
  motorcycleColorHex,
  riderTelHref,
  riderWhatsAppHref,
  vehicleTypeLabel,
} from '@/lib/dispatch/riderDisplay';
import { publicMenuOrigin } from '@/lib/restaurantSubdomain';
import styles from './DispatchRecentRequests.module.css';

const STATUS_LABELS: Record<DispatchStatus, string> = {
  scheduled: 'Cocinando',
  searching: 'Buscando repartidor',
  offered: 'Oferta enviada',
  assigned: 'Repartidor asignado',
  picked_up: 'Pedido recogido',
  in_transit: 'En camino',
  delivered: 'Entregado',
  unassigned: 'Sin repartidor',
  cancelled: 'Cancelado',
};

const CASH_CONFIRMABLE = new Set<DispatchStatus>([
  'assigned',
  'picked_up',
  'in_transit',
  'delivered',
]);

function money(cents: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(cents / 100);
}

function paymentLabel(method: DispatchRequest['payment_method']): string {
  if (method === 'cash') return 'Efectivo';
  if (method === 'transfer') return 'Transferencia';
  return 'Terminal';
}

function packageLabel(request: DispatchRequest): string {
  const size = request.package_size === 'grande' ? 'Grande' : 'Normal';
  const count = request.package_count === 1 ? '1 paquete' : `${request.package_count} paquetes`;
  return `${size} · ${count}`;
}

export function canCancelDispatch(request: DispatchRequest): boolean {
  return (
    !request.assigned_driver_id &&
    request.status !== 'cancelled' &&
    request.status !== 'delivered' &&
    request.status !== 'assigned' &&
    request.status !== 'picked_up' &&
    request.status !== 'in_transit'
  );
}

export function canConfirmRiderCash(request: DispatchRequest): boolean {
  return request.payment_method === 'cash' && CASH_CONFIRMABLE.has(request.status);
}

function riderAlreadyAssigned(request: DispatchRequest): boolean {
  return (
    request.rider != null ||
    request.assigned_driver_id != null ||
    request.status === 'assigned' ||
    request.status === 'picked_up' ||
    request.status === 'in_transit'
  );
}

function statusTone(status: DispatchStatus): string {
  if (status === 'delivered') return styles.chipDone;
  if (status === 'cancelled' || status === 'unassigned') return styles.chipAlert;
  if (status === 'assigned' || status === 'picked_up' || status === 'in_transit') {
    return styles.chipActive;
  }
  if (status === 'searching' || status === 'offered') return styles.chipSearch;
  return styles.chipIdle;
}

function trackingUrlFor(subdomain: string, token: string): string {
  return `${publicMenuOrigin(subdomain)}/rastreo/${token}`;
}

function shareWhatsApp(request: DispatchRequest, url: string) {
  const shortId = formatDispatchShortId(request.short_id);
  const text = `Rastrea tu entrega ${shortId}\n${url}`;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer',
  );
}

function RiderPhoto({ rider }: { rider: DispatchAssignedRider }) {
  const [broken, setBroken] = useState(false);
  if (!rider.photo_url || broken) {
    return (
      <span className={styles.riderPhotoFallback} aria-hidden>
        {rider.first_name.trim().charAt(0).toUpperCase() || 'R'}
      </span>
    );
  }
  return (
    <img
      className={styles.riderPhoto}
      src={rider.photo_url}
      alt=""
      onError={() => setBroken(true)}
    />
  );
}

type DispatchRecentRequestsProps = {
  requests: DispatchRequest[];
  subdomain: string;
  variant?: 'active' | 'history';
  busy?: boolean;
  onRetry: (request: DispatchRequest) => void;
  onCancel: (request: DispatchRequest) => void;
  onConfirmCash: (request: DispatchRequest) => void;
};

export function DispatchRecentRequests({
  requests,
  subdomain,
  variant = 'active',
  busy = false,
  onRetry,
  onCancel,
  onConfirmCash,
}: DispatchRecentRequestsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const isHistory = variant === 'history';

  async function copyTracking(request: DispatchRequest) {
    if (!subdomain) return;
    const url = trackingUrlFor(subdomain, request.tracking_token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(request.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === request.id ? null : current));
      }, 2000);
    } catch {
      window.prompt('Copia el enlace de rastreo', url);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="dispatch-list-title">
      <header className={styles.sectionHeading}>
        <h2 id="dispatch-list-title">{isHistory ? 'Historial' : 'Solicitudes activas'}</h2>
        <p>
          {isHistory
            ? 'Entregas y cancelaciones.'
            : 'Estado, rastreo y detalle de cada entrega en curso.'}
        </p>
      </header>
      <ul className={styles.list}>
        {requests.length ? (
          requests.map((request) => {
            const expanded = expandedId === request.id;
            const detailsId = `dispatch-details-${request.id}`;
            const trackingUrl = subdomain
              ? trackingUrlFor(subdomain, request.tracking_token)
              : null;
            const rider = request.rider;
            const shortId = formatDispatchShortId(request.short_id);
            const telHref = rider ? riderTelHref(rider.phone) : null;
            const riderWaHref = rider
              ? riderWhatsAppHref(rider.phone, rider.first_name, shortId)
              : null;
            return (
              <li key={request.id}>
                <article
                  className={`${styles.request}${expanded ? ` ${styles.requestOpen}` : ''}`}
                >
                  <div className={styles.requestTop}>
                    <button
                      type="button"
                      className={styles.requestToggle}
                      aria-expanded={expanded}
                      aria-controls={detailsId}
                      aria-label={`${expanded ? 'Ocultar' : 'Ver'} detalles de ${shortId} ${request.customer_name}`}
                      onClick={() =>
                        setExpandedId((current) => (current === request.id ? null : request.id))
                      }
                    >
                      <span className={styles.requestBody}>
                        <span className={styles.requestTitle}>
                          <span className={styles.shortId}>{shortId}</span>
                          {request.customer_name}
                        </span>
                        <span className={styles.requestAddress}>{request.dropoff_address}</span>
                        <span className={styles.requestMeta}>
                          <span className={`${styles.statusChip} ${statusTone(request.status)}`}>
                            {STATUS_LABELS[request.status]}
                          </span>
                          <span className={styles.costPair}>
                            {request.payment_method !== 'transfer' ? (
                              <span className={styles.costChip}>
                                Restaurante {money(request.collect_cents)}
                              </span>
                            ) : null}
                            <span className={`${styles.costChip} ${styles.costChipDelivery}`}>
                              Envío {money(request.quoted_fee_cents)}
                            </span>
                          </span>
                          <span>{paymentLabel(request.payment_method)}</span>
                          {rider ? (
                            <span className={styles.riderHint}>
                              {rider.first_name}
                              {rider.plate_suffix ? ` · ···${rider.plate_suffix}` : ''}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span
                        className={`${styles.chevron}${expanded ? ` ${styles.chevronOpen}` : ''}`}
                        aria-hidden
                      >
                        <ExpandMoreOutlinedIcon sx={{ fontSize: 20 }} />
                      </span>
                    </button>
                    <div className={styles.quickActions}>
                      {!isHistory && trackingUrl ? (
                        <>
                          <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={
                              copiedId === request.id
                                ? 'Enlace de rastreo copiado'
                                : 'Copiar enlace de rastreo'
                            }
                            onClick={() => void copyTracking(request)}
                          >
                            {copiedId === request.id ? (
                              <CheckOutlinedIcon fontSize="small" />
                            ) : (
                              <ContentCopyOutlinedIcon fontSize="small" />
                            )}
                            <span>{copiedId === request.id ? 'Copiado' : 'Copiar'}</span>
                          </button>
                          <button
                            type="button"
                            className={`${styles.iconButton} ${styles.whatsappButton}`}
                            aria-label="Compartir rastreo en WhatsApp"
                            onClick={() => shareWhatsApp(request, trackingUrl)}
                          >
                            <WhatsAppIcon fontSize="small" />
                            <span>Compartir en WhatsApp</span>
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.details} id={detailsId} hidden={!expanded}>
                    {isHistory && rider ? (
                      <p className={styles.historyRider} aria-label="Repartidor">
                        <span className={styles.historyRiderName}>{rider.first_name}</span>
                        <span className={styles.historyRiderPlate}>
                          {rider.plate_suffix ? `···${rider.plate_suffix}` : 'Sin placas'}
                        </span>
                      </p>
                    ) : null}
                    {!isHistory && rider ? (
                      <article className={styles.riderCard} aria-label="Datos del repartidor">
                        <RiderPhoto rider={rider} />
                        <div className={styles.riderBody}>
                          <p className={styles.riderName}>{rider.first_name}</p>
                          <p className={styles.riderVehicle}>
                            {vehicleTypeLabel(rider.vehicle_type)}
                            {rider.motorcycle_brand ? ` · ${rider.motorcycle_brand}` : ''}
                            {rider.motorcycle_color ? (
                              <>
                                {' · '}
                                <span className={styles.riderColor}>
                                  <span
                                    className={styles.colorDot}
                                    style={{
                                      background: motorcycleColorHex(rider.motorcycle_color),
                                    }}
                                    aria-hidden
                                  />
                                  {rider.motorcycle_color}
                                </span>
                              </>
                            ) : null}
                          </p>
                          <p className={styles.riderPlate}>
                            Placas {rider.plate_suffix ? `···${rider.plate_suffix}` : '—'}
                          </p>
                        </div>
                        {telHref || riderWaHref ? (
                          <div className={styles.riderActions}>
                            {telHref ? (
                              <a
                                href={telHref}
                                className={styles.riderAction}
                                aria-label={`Llamar a ${rider.first_name}`}
                              >
                                <PhoneOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
                                Llamar
                              </a>
                            ) : null}
                            {riderWaHref ? (
                              <a
                                href={riderWaHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`${styles.riderAction} ${styles.riderActionWhatsApp}`}
                                aria-label={`WhatsApp a ${rider.first_name}`}
                              >
                                <WhatsAppIcon fontSize="small" />
                                WhatsApp
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    ) : !isHistory &&
                      riderAlreadyAssigned(request) &&
                      request.status !== 'delivered' ? (
                      <p className={styles.assignedNote}>
                        Ya hay un repartidor asignado. Este envío no se puede cancelar.
                      </p>
                    ) : null}

                    <dl className={styles.detailList}>
                      <div>
                        <dt>Cliente</dt>
                        <dd>
                          {request.customer_name}
                          {request.customer_phone ? (
                            <>
                              {' · '}
                              <a href={`tel:${request.customer_phone}`}>{request.customer_phone}</a>
                            </>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt>Entrega</dt>
                        <dd>{request.dropoff_address}</dd>
                      </div>
                      <div>
                        <dt>Pago</dt>
                        <dd>
                          {paymentLabel(request.payment_method)}
                          {request.payment_method === 'cash' && request.cash_denomination_cents
                            ? ` · paga con ${money(request.cash_denomination_cents)}`
                            : null}
                        </dd>
                      </div>
                      <div>
                        <dt>Paquete</dt>
                        <dd>{packageLabel(request)}</dd>
                      </div>
                      {request.notes ? (
                        <div>
                          <dt>Notas</dt>
                          <dd>{request.notes}</dd>
                        </div>
                      ) : null}
                      {request.dropoff_maps_url ? (
                        <div>
                          <dt>Maps</dt>
                          <dd>
                            <a href={request.dropoff_maps_url} target="_blank" rel="noreferrer">
                              Abrir ubicación
                            </a>
                          </dd>
                        </div>
                      ) : null}
                    </dl>

                    <div className={styles.costCard}>
                      <DispatchCostBreakdown
                        restaurantCents={request.collect_cents}
                        deliveryCents={request.quoted_fee_cents}
                        paymentMethod={request.payment_method}
                      />
                    </div>

                    {!isHistory && trackingUrl ? (
                      <a
                        className={styles.trackingLink}
                        href={trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <OpenInNewOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
                        Abrir enlace de rastreo
                      </a>
                    ) : null}

                    <div className={styles.actions}>
                      {request.status === 'unassigned' ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={busy}
                          onClick={() => onRetry(request)}
                        >
                          Reintentar
                        </button>
                      ) : null}
                      {canConfirmRiderCash(request) ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={busy}
                          onClick={() => onConfirmCash(request)}
                        >
                          Rider ya me pagó
                        </button>
                      ) : null}
                      {canCancelDispatch(request) ? (
                        <button
                          type="button"
                          className={styles.dangerButton}
                          disabled={busy}
                          onClick={() => onCancel(request)}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              </li>
            );
          })
        ) : (
          <li className={styles.empty}>
            <LocalShippingOutlinedIcon aria-hidden />
            <span>
              {isHistory
                ? 'Todavía no hay entregas ni cancelaciones.'
                : 'No hay envíos en curso.'}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}

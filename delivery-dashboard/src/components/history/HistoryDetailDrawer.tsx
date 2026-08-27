'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { DriverAvatar } from '@/components/drivers/DriverAvatar';
import { DriverMetaTags } from '@/components/drivers/DriverMetaTags';
import { DriverPhoneContact } from '@/components/drivers/DriverPhoneContact';
import { DispatchRequestLogSections } from '@/components/monitor/DispatchRequestLogSections';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { getAssignmentLog } from '@/lib/api/deliveryProviders';
import type { AssignmentLog, DispatchHistoryItem } from '@/lib/api/types';
import {
  ASSIGNMENT_LOG_ERROR,
  assignmentSchedulerLines,
  caseLabel,
  customerCollectCents,
  formatCoords,
  formatDateTime,
  formatShortId,
  mapsSearchUrl,
  paymentLabel,
  requestStatusLabel,
} from '@/lib/dispatch/monitorCopy';
import { formatMoney } from '@/lib/pricing/tariffUtils';
import { publicTrackingUrl } from '@/lib/dispatch/publicTrackingUrl';
import { formatPrepMinutes, requestPrepMinutes } from '@/lib/dispatch/prepTime';
import styles from '@/components/monitor/RequestDetailDrawer.module.css';

type HistoryDetailDrawerProps = {
  open: boolean;
  item: DispatchHistoryItem | null;
  accessToken: string | null;
  onClose: () => void;
};

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  if (children == null || children === '') return null;
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
      {children}
    </a>
  );
}

function packageLine(item: DispatchHistoryItem): string {
  const count = item.package_count ?? 1;
  const size = item.package_size === 'grande' ? 'Grande' : 'Normal';
  const countLabel = count === 1 ? '1 paquete' : `${count} paquetes`;
  return `${countLabel} · ${size}`;
}

function cashDenominationLine(item: DispatchHistoryItem): string | null {
  if (item.payment_method !== 'cash' || item.cash_denomination_cents == null) {
    return null;
  }
  return `Pagará con ${formatMoney(item.cash_denomination_cents)}`;
}

function holdStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  if (status === 'held') return 'En hold';
  if (status === 'released') return 'Liberado';
  if (status === 'captured') return 'Cargado';
  return status;
}

export function HistoryDetailDrawer({
  open,
  item,
  accessToken,
  onClose,
}: HistoryDetailDrawerProps) {
  const [log, setLog] = useState<AssignmentLog | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(false);

  useEffect(() => {
    setLog(null);
    setLogError(null);
  }, [item?.id]);

  useEffect(() => {
    if (!open || !item || !accessToken) {
      setLog(null);
      setLogError(null);
      return;
    }
    let cancelled = false;
    setLogLoading(true);
    setLogError(null);
    void getAssignmentLog(accessToken, item.id)
      .then((data) => {
        if (!cancelled) setLog(data);
      })
      .catch(() => {
        if (!cancelled) setLogError(ASSIGNMENT_LOG_ERROR);
      })
      .finally(() => {
        if (!cancelled) setLogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, item?.id, accessToken]);

  const cashDenom = item ? cashDenominationLine(item) : null;
  const trackingUrl = item
    ? publicTrackingUrl(item.tracking_token, item.restaurant_subdomain)
    : null;
  const dropoffCoords = item ? formatCoords(item.dropoff_lat, item.dropoff_lng) : null;
  const dropoffMaps = item
    ? item.dropoff_maps_url || mapsSearchUrl(item.dropoff_lat, item.dropoff_lng)
    : null;
  const restaurantCoords = item
    ? formatCoords(item.restaurant_lat, item.restaurant_lng)
    : null;
  const restaurantMaps = item
    ? mapsSearchUrl(item.restaurant_lat, item.restaurant_lng)
    : null;
  const visibleLog = item && log?.request_id === item.id ? log : null;
  const schedulerLines = item
    ? assignmentSchedulerLines(visibleLog, item.status, Date.now())
    : [];
  const deliveryCents = item?.quoted_fee_cents ?? 0;
  const restaurantCents = item?.collect_cents ?? 0;
  const customerTotalCents = item ? customerCollectCents(item) : 0;
  const changeCents =
    item?.payment_method === 'cash' &&
    item.cash_denomination_cents != null &&
    item.cash_denomination_cents > customerTotalCents
      ? item.cash_denomination_cents - customerTotalCents
      : null;
  const deliveredRider =
    item?.status === 'delivered' &&
    (item.assigned_driver_id != null || Boolean(item.assigned_driver_name));

  return (
    <RightDrawer
      open={open}
      size="narrow"
      title={item ? `Pedido ${formatShortId(item.short_id)}` : 'Pedido'}
      onClose={onClose}
    >
      {item ? (
        <div className={styles.body}>
          <p className={styles.lede}>
            {item.customer_name || item.restaurant_name}
            <span> · {requestStatusLabel(item.status)}</span>
          </p>

          <section className={styles.section} aria-labelledby="history-detail-solicitud">
            <h3 id="history-detail-solicitud" className={styles.heading}>
              Pedido
            </h3>
            <dl className={styles.list}>
              <DetailRow label="Cliente">{item.customer_name}</DetailRow>
              <DetailRow label="Celular">
                {item.customer_phone ? (
                  <DriverPhoneContact phone={item.customer_phone} compact />
                ) : null}
              </DetailRow>
              <DetailRow label="Restaurante">{item.restaurant_name}</DetailRow>
              <DetailRow label="Dirección restaurante">{item.restaurant_address}</DetailRow>
              <DetailRow label="Recoger">
                {restaurantCoords && restaurantMaps ? (
                  <ExternalLink href={restaurantMaps}>{restaurantCoords}</ExternalLink>
                ) : (
                  restaurantCoords
                )}
              </DetailRow>
              <DetailRow label="Zona">{item.zone_name}</DetailRow>
              <DetailRow label="Entrega">{item.dropoff_address}</DetailRow>
              <DetailRow label="Coordenadas entrega">
                {dropoffCoords && dropoffMaps ? (
                  <ExternalLink href={dropoffMaps}>{dropoffCoords}</ExternalLink>
                ) : (
                  dropoffCoords
                )}
              </DetailRow>
              <DetailRow label="Pago">{paymentLabel(item.payment_method)}</DetailRow>
              {item.payment_method !== 'transfer' ? (
                <DetailRow label="Cobrar">
                  {customerTotalCents > 0 ? formatMoney(customerTotalCents) : 'Sin cobro'}
                </DetailRow>
              ) : null}
              {item.payment_method !== 'transfer' ? (
                <DetailRow label="Monto restaurante">
                  {restaurantCents > 0 ? formatMoney(restaurantCents) : 'Sin cobro'}
                </DetailRow>
              ) : null}
              {cashDenom ? (
                <DetailRow label="Paga con">{cashDenom.replace(/^Pagará con /, '')}</DetailRow>
              ) : null}
              {changeCents != null ? (
                <DetailRow label="Cambio">{formatMoney(changeCents)}</DetailRow>
              ) : null}
              <DetailRow label="Envío">
                {deliveryCents > 0 ? formatMoney(deliveryCents) : null}
              </DetailRow>
              <DetailRow label="Paquetes">{packageLine(item)}</DetailRow>
              <DetailRow label="Notas">{item.notes}</DetailRow>
              <DetailRow label="Caso">{caseLabel(item.case_applied)}</DetailRow>
              <DetailRow label="Grupo">{item.dispatch_group_id}</DetailRow>
              <DetailRow label="Hold">
                {item.credit_hold_cents > 0
                  ? `${formatMoney(item.credit_hold_cents)}${
                      holdStatusLabel(item.credit_hold_status)
                        ? ` · ${holdStatusLabel(item.credit_hold_status)}`
                        : ''
                    }`
                  : holdStatusLabel(item.credit_hold_status)}
              </DetailRow>
            </dl>
          </section>

          {deliveredRider ? (
            <section className={styles.section} aria-labelledby="history-detail-repa">
              <h3 id="history-detail-repa" className={styles.heading}>
                Repartidor
              </h3>
              {item.assigned_driver_first_name || item.assigned_driver_plate ? (
                <div className={styles.riderCard}>
                  <DriverAvatar
                    firstName={item.assigned_driver_first_name ?? ''}
                    lastName={item.assigned_driver_last_name ?? ''}
                    profilePhotoPath={item.assigned_driver_profile_photo_path}
                    size="md"
                  />
                  <div className={styles.riderBody}>
                    <p className={styles.riderName}>
                      {item.assigned_driver_name ??
                        `${item.assigned_driver_first_name ?? ''} ${item.assigned_driver_last_name ?? ''}`.trim()}
                    </p>
                    <DriverMetaTags
                      plate={item.assigned_driver_plate ?? ''}
                      motorcycleColor={item.assigned_driver_motorcycle_color ?? ''}
                      compartmentSize={item.assigned_driver_compartment_size ?? 'normal'}
                    />
                    <DriverPhoneContact phone={item.assigned_driver_phone} compact />
                  </div>
                </div>
              ) : (
                <p className={styles.riderFallback}>
                  {item.assigned_driver_name ?? 'Repartidor'}
                </p>
              )}
            </section>
          ) : null}

          <DispatchRequestLogSections
            timeline={item.timeline ?? []}
            schedulerLines={schedulerLines}
            logError={logError}
            logLoading={logLoading}
            hasLog={visibleLog != null}
            assignmentEvents={visibleLog?.events ?? []}
          />

          <section className={styles.section} aria-labelledby="history-detail-tiempos">
            <h3 id="history-detail-tiempos" className={styles.heading}>
              Tiempos
            </h3>
            <dl className={styles.list}>
              <DetailRow label="Creado">{formatDateTime(item.created_at)}</DetailRow>
              <DetailRow label="Listo">{formatDateTime(item.ready_at)}</DetailRow>
              <DetailRow label="Búsqueda">{formatDateTime(item.search_at)}</DetailRow>
              <DetailRow label="Cierre">{formatDateTime(item.closed_at)}</DetailRow>
              <DetailRow label="Cancelado">{formatDateTime(item.cancelled_at)}</DetailRow>
              <DetailRow label="Actualizado">{formatDateTime(item.updated_at)}</DetailRow>
            </dl>
          </section>
        </div>
      ) : null}
    </RightDrawer>
  );
}

'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { DispatchRequestLogSections } from '@/components/monitor/DispatchRequestLogSections';
import { DriverPhoneContact } from '@/components/drivers/DriverPhoneContact';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { getAssignmentLog } from '@/lib/api/deliveryProviders';
import type { AssignmentLog, DispatchMonitorRequest } from '@/lib/api/types';
import {
  ASSIGNMENT_LOG_ERROR,
  assignmentSchedulerLines,
  blockersSummary,
  formatCoords,
  formatShortId,
  mapsSearchUrl,
  paymentLabel,
  requestCashDenominationLine,
  requestPackageLine,
  requestStatusLabel,
} from '@/lib/dispatch/monitorCopy';
import { formatMoney } from '@/lib/pricing/tariffUtils';
import styles from './RequestDetailDrawer.module.css';

type RequestDetailDrawerProps = {
  open: boolean;
  request: DispatchMonitorRequest | null;
  accessToken: string | null;
  refreshNonce: number;
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

export function RequestDetailDrawer({
  open,
  request,
  accessToken,
  refreshNonce,
  onClose,
}: RequestDetailDrawerProps) {
  const [log, setLog] = useState<AssignmentLog | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    setLog(null);
    setLogError(null);
  }, [request?.id]);

  useEffect(() => {
    if (!open || !request || !accessToken) {
      setLog(null);
      setLogError(null);
      return;
    }
    let cancelled = false;
    setLogLoading(true);
    setLogError(null);
    void getAssignmentLog(accessToken, request.id)
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
  }, [open, request?.id, accessToken, refreshNonce]);

  const visibleLog = request && log?.request_id === request.id ? log : null;
  const cashDenom = request ? requestCashDenominationLine(request) : null;
  const blockers = request ? blockersSummary(request.search_blockers) : null;
  const dropoffCoords = request ? formatCoords(request.dropoff_lat, request.dropoff_lng) : null;
  const dropoffMaps = request
    ? request.dropoff_maps_url || mapsSearchUrl(request.dropoff_lat, request.dropoff_lng)
    : null;
  const restaurantCoords = request
    ? formatCoords(request.restaurant_lat, request.restaurant_lng)
    : null;
  const restaurantMaps = request
    ? mapsSearchUrl(request.restaurant_lat, request.restaurant_lng)
    : null;
  const changeCents =
    request?.payment_method === 'cash' &&
    request.cash_denomination_cents != null &&
    request.cash_denomination_cents > request.collect_cents
      ? request.cash_denomination_cents - request.collect_cents
      : null;
  const timeline = request?.timeline ?? [];
  const schedulerLog: AssignmentLog | null =
    visibleLog ??
    (request?.status === 'scheduled'
      ? {
          request_id: request.id,
          last_search_at: null,
          next_attempt_at: request.search_at,
          assignment_timeout_at: request.assignment_timeout_at ?? null,
          events: [],
        }
      : null);
  const schedulerLines = request
    ? assignmentSchedulerLines(schedulerLog, request.status, nowMs)
    : [];
  const assignmentEvents = visibleLog?.events ?? [];
  const highlightLast =
    request?.status === 'searching' || request?.status === 'offered';

  return (
    <RightDrawer
      open={open}
      size="narrow"
      title={request ? `Pedido ${formatShortId(request.short_id)}` : 'Pedido'}
      onClose={onClose}
    >
      {request ? (
        <div className={styles.body}>
          <p className={styles.lede}>
            {request.customer_name}
            <span> · {requestStatusLabel(request.status)}</span>
          </p>

          <section className={styles.section} aria-labelledby="request-detail-solicitud">
            <h3 id="request-detail-solicitud" className={styles.heading}>
              Solicitud del restaurante
            </h3>
            <dl className={styles.list}>
              <DetailRow label="Cliente">{request.customer_name}</DetailRow>
              <DetailRow label="Celular">
                {request.customer_phone ? (
                  <DriverPhoneContact phone={request.customer_phone} compact />
                ) : null}
              </DetailRow>
              <DetailRow label="Restaurante">{request.restaurant_name}</DetailRow>
              <DetailRow label="Recoger">
                {restaurantCoords && restaurantMaps ? (
                  <ExternalLink href={restaurantMaps}>{restaurantCoords}</ExternalLink>
                ) : (
                  restaurantCoords
                )}
              </DetailRow>
              <DetailRow label="Zona">{request.zone_name}</DetailRow>
              <DetailRow label="Entrega">{request.dropoff_address}</DetailRow>
              <DetailRow label="Coordenadas entrega">
                {dropoffCoords && dropoffMaps ? (
                  <ExternalLink href={dropoffMaps}>{dropoffCoords}</ExternalLink>
                ) : (
                  dropoffCoords
                )}
              </DetailRow>
              {request.dropoff_maps_url ? (
                <DetailRow label="Maps">
                  <ExternalLink href={request.dropoff_maps_url}>Abrir ubicación</ExternalLink>
                </DetailRow>
              ) : null}
              <DetailRow label="Pago">{paymentLabel(request.payment_method)}</DetailRow>
              {request.payment_method !== 'transfer' ? (
                <DetailRow label="Cobrar">
                  {request.collect_cents > 0 ? formatMoney(request.collect_cents) : 'Sin cobro'}
                </DetailRow>
              ) : null}
              {cashDenom ? <DetailRow label="Paga con">{cashDenom.replace(/^Pagará con /, '')}</DetailRow> : null}
              {changeCents != null ? (
                <DetailRow label="Cambio">{formatMoney(changeCents)}</DetailRow>
              ) : null}
              <DetailRow label="Envío">
                {(request.quoted_fee_cents ?? 0) > 0 ? formatMoney(request.quoted_fee_cents ?? 0) : null}
              </DetailRow>
              <DetailRow label="Paquete">{requestPackageLine(request)}</DetailRow>
              <DetailRow label="Notas">{request.notes?.trim() || null}</DetailRow>
            </dl>
          </section>

          <DispatchRequestLogSections
            timeline={timeline}
            blockers={blockers}
            eligibleCount={request.eligible_driver_count ?? 0}
            schedulerLines={schedulerLines}
            logError={logError}
            logLoading={logLoading}
            hasLog={visibleLog != null}
            assignmentEvents={assignmentEvents}
            highlightLast={highlightLast}
          />
        </div>
      ) : null}
    </RightDrawer>
  );
}

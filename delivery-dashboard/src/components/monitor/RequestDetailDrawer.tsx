'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { DriverPhoneContact } from '@/components/drivers/DriverPhoneContact';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { getAssignmentLog } from '@/lib/api/deliveryProviders';
import type { AssignmentLog, DispatchMonitorRequest } from '@/lib/api/types';
import {
  ASSIGNMENT_LOG_EMPTY,
  ASSIGNMENT_LOG_ERROR,
  ASSIGNMENT_LOG_LOADING,
  assignmentSchedulerLines,
  blockersSummary,
  caseLabel,
  formatCoords,
  formatShortId,
  formatTimelineTime,
  mapsSearchUrl,
  paymentLabel,
  requestCashDenominationLine,
  requestPackageLine,
  requestStatusLabel,
  timelineEventTitle,
  timelineEventTone,
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

function assignmentEventToneClass(
  tone: string,
  isNow: boolean,
): string {
  if (isNow) return styles.toneNow;
  if (tone === 'ok') return styles.toneOk;
  if (tone === 'warn') return styles.toneWarn;
  return styles.toneNeutral;
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
    log ??
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
  const assignmentEvents = log?.events ?? [];
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

          <section className={styles.section} aria-labelledby="request-detail-asignacion">
            <h3 id="request-detail-asignacion" className={styles.heading}>
              Asignación
            </h3>
            {schedulerLines.length > 0 ? (
              <div className={styles.scheduler}>
                {schedulerLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
            ) : null}
            {logError ? (
              <p className={styles.alert} role="alert">
                {logError}
              </p>
            ) : logLoading && !log ? (
              <p className={styles.empty}>{ASSIGNMENT_LOG_LOADING}</p>
            ) : assignmentEvents.length === 0 ? (
              <p className={styles.empty}>{ASSIGNMENT_LOG_EMPTY}</p>
            ) : (
              <ol className={styles.timeline}>
                {assignmentEvents.map((event, index) => {
                  const isNow = highlightLast && index === assignmentEvents.length - 1;
                  return (
                    <li
                      key={event.id}
                      className={`${styles.step} ${assignmentEventToneClass(event.tone, isNow)}`}
                    >
                      <time className={styles.time} dateTime={event.at}>
                        {formatTimelineTime(event.at)}
                      </time>
                      <span className={styles.marker} aria-hidden />
                      <span className={styles.event}>
                        <strong>{event.title}</strong>
                        {event.detail ? <span>{event.detail}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className={styles.section} aria-labelledby="request-detail-operacion">
            <h3 id="request-detail-operacion" className={styles.heading}>
              Operación
            </h3>
            {timeline.length === 0 ? (
              <p className={styles.empty}>Sin eventos todavía.</p>
            ) : (
              <ol className={styles.timeline}>
                {timeline.map((event, index) => {
                  const tone = timelineEventTone(event);
                  const caseText = caseLabel(event.case_applied);
                  const toneClass =
                    tone === 'now'
                      ? styles.toneNow
                      : tone === 'warn'
                        ? styles.toneWarn
                        : tone === 'alert'
                          ? styles.toneAlert
                          : tone === 'ok'
                            ? styles.toneOk
                            : styles.toneNeutral;
                  return (
                    <li
                      key={`${event.kind}-${event.at ?? 'na'}-${event.driver_name ?? ''}-${index}`}
                      className={`${styles.step} ${toneClass}`}
                    >
                      <time className={styles.time} dateTime={event.at ?? undefined}>
                        {formatTimelineTime(event.at)}
                      </time>
                      <span className={styles.marker} aria-hidden />
                      <span className={styles.event}>
                        <strong>{timelineEventTitle(event)}</strong>
                        {caseText ? <span>{caseText}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {blockers ? (
              <p className={styles.blockers}>
                {request.eligible_driver_count ?? 0} candidatos · {blockers}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </RightDrawer>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AssignDriverDrawer } from '@/components/monitor/AssignDriverDrawer';
import { DispatchMonitorMap } from '@/components/monitor/DispatchMonitorMap';
import { DriverAvatar } from '@/components/drivers/DriverAvatar';
import { DriverMetaTags } from '@/components/drivers/DriverMetaTags';
import { DriverPhoneContact } from '@/components/drivers/DriverPhoneContact';
import { PanelPageShell, type PanelPageStyles } from '@/components/pages/PanelPageShell';
import { useDeliveryProviderAccess } from '@/contexts/DeliveryProviderAccessContext';
import { useDeliveryZone } from '@/contexts/DeliveryZoneContext';
import { useAuth } from '@/hooks/useAuth';
import { createMyManualDispatchOffer, getMyDispatchMonitor } from '@/lib/api/deliveryProviders';
import type {
  DispatchMonitorCreditHold,
  DispatchMonitorDriver,
  DispatchMonitorOffer,
  DispatchMonitorRequest,
  DispatchMonitorSnapshot,
} from '@/lib/api/types';
import {
  blockersSummary,
  demandReasonLine,
  formatCountdown,
  formatSearchStartedAt,
  formatShortId,
  formatTime,
  gpsAgeLabel,
  offerCaseLine,
  requestCashDenominationLine,
  requestLastAssignmentLine,
  requestMoneyLine,
  requestPackageLine,
  requestSchedulerLine,
  requestStatusLabel,
} from '@/lib/dispatch/monitorCopy';
import {
  useDispatchMonitorSocket,
  type DispatchMonitorSocketStatus,
} from '@/lib/dispatch/useDispatchMonitorSocket';
import { formatMoney } from '@/lib/pricing/tariffUtils';
import panelStyles from './PartnershipsPage.module.css';
import styles from './MonitorPage.module.css';

function connectionLabel(status: DispatchMonitorSocketStatus): string {
  if (status === 'live') return 'En vivo';
  if (status === 'connecting') return 'Conectando…';
  if (status === 'reconnecting') return 'Reconectando…';
  return 'Sin conexión';
}

function MetricCard({
  label,
  value,
  tone,
  hint,
  onClick,
  pressed,
}: {
  label: string;
  value: string | number;
  tone?: string;
  hint?: string | null;
  onClick?: () => void;
  pressed?: boolean;
}) {
  const className = [
    styles.metricCard,
    tone ? styles[tone] : '',
    onClick ? styles.metricCardClickable : '',
    pressed ? styles.metricCardPressed : '',
  ]
    .filter(Boolean)
    .join(' ');
  const body = (
    <>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
      {hint ? <span className={styles.metricHint}>{hint}</span> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={pressed}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

type DriverFilter = 'all' | 'online' | 'stale' | 'offline';

function isStaleGps(driver: DispatchMonitorDriver): boolean {
  return driver.is_online && driver.location_stale;
}

function driverMatchesFilter(driver: DispatchMonitorDriver, filter: DriverFilter): boolean {
  if (filter === 'online') return driver.is_online;
  if (filter === 'offline') return !driver.is_online;
  if (filter === 'stale') return isStaleGps(driver);
  return true;
}

function QueueList({
  requests,
  canAssign,
  onAssign,
  onFocus,
  focusedRequestId,
  nowMs,
  emptyHint = 'Sin pedidos en cola.',
}: {
  requests: DispatchMonitorRequest[];
  canAssign: boolean;
  onAssign: (request: DispatchMonitorRequest) => void;
  onFocus: (request: DispatchMonitorRequest) => void;
  focusedRequestId: string | null;
  nowMs: number;
  emptyHint?: string;
}) {
  if (requests.length === 0) {
    return <p className={styles.emptyHint}>{emptyHint}</p>;
  }
  return (
    <ul className={styles.list}>
      {requests.map((request) => {
        const scheduler = requestSchedulerLine(request, nowMs);
        const blockers = blockersSummary(request.search_blockers);
        const searchingStuck =
          ['searching', 'unassigned', 'offered'].includes(request.status) &&
          (request.eligible_driver_count ?? 0) === 0;
        const focused = focusedRequestId === request.id;
        const lastLine = requestLastAssignmentLine(request);
        const cashDenom = requestCashDenominationLine(request);
        return (
          <li
            key={request.id}
            className={`${styles.queueCard}${focused ? ` ${styles.queueCardFocused}` : ''}`}
          >
            <button
              type="button"
              className={styles.queueCardButton}
              onClick={() => onFocus(request)}
              aria-pressed={focused}
            >
              <span className={styles.listTitle}>
                <span className={styles.shortId}>{formatShortId(request.short_id)}</span>
                {request.customer_name}
              </span>
              <span className={styles.listMeta}>
                {request.restaurant_name}
                {request.zone_name ? ` · ${request.zone_name}` : ''}
              </span>
              <span className={styles.listAddress}>{request.dropoff_address}</span>
              <span className={styles.queueMeta}>
                <span className={styles.queueTag} title="Inicio de búsqueda de repartidor">
                  {formatSearchStartedAt(request.search_at)}
                </span>
                <span className={styles.queueTag}>{requestPackageLine(request)}</span>
                {cashDenom ? <span className={styles.queueTagCash}>{cashDenom}</span> : null}
                <span className={styles.queueTag}>{requestMoneyLine(request)}</span>
              </span>
              {scheduler ? <span className={styles.listSchedule}>{scheduler}</span> : null}
              {lastLine ? <span className={styles.queueLast}>{lastLine}</span> : null}
              {searchingStuck && blockers ? (
                <span className={styles.listBlockers}>0 candidatos · {blockers}</span>
              ) : null}
            </button>
            <div className={styles.queueCardSide}>
              <span className={styles.statusChip}>{requestStatusLabel(request.status)}</span>
              {request.is_due_search ? <span className={styles.dueChip}>Listo</span> : null}
              {canAssign ? (
                <button type="button" className={styles.assignButton} onClick={() => onAssign(request)}>
                  Asignar
                </button>
              ) : null}
              {request.customer_phone ? (
                <DriverPhoneContact
                  phone={request.customer_phone}
                  compact
                  stopPropagation
                  className={styles.asidePhone}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ActiveList({
  requests,
  canAssign,
  onAssign,
  onFocus,
  focusedRequestId,
  nowMs,
}: {
  requests: DispatchMonitorRequest[];
  canAssign: boolean;
  onAssign: (request: DispatchMonitorRequest) => void;
  onFocus: (request: DispatchMonitorRequest) => void;
  focusedRequestId: string | null;
  nowMs: number;
}) {
  if (requests.length === 0) {
    return <p className={styles.emptyHint}>Sin entregas en curso.</p>;
  }
  return (
    <ul className={styles.list}>
      {requests.map((request) => {
        const scheduler = requestSchedulerLine(request, nowMs);
        const focused = focusedRequestId === request.id;
        return (
          <li
            key={request.id}
            className={`${styles.queueCard}${focused ? ` ${styles.queueCardFocused}` : ''}`}
          >
            <button
              type="button"
              className={styles.queueCardButton}
              onClick={() => onFocus(request)}
              aria-pressed={focused}
            >
              <span className={styles.listTitle}>
                <span className={styles.shortId}>{formatShortId(request.short_id)}</span>
                {request.customer_name}
              </span>
              <span className={styles.listMeta}>
                {request.assigned_driver_name ?? 'Sin repartidor'} · {request.restaurant_name}
              </span>
              <span className={styles.listAddress}>{request.dropoff_address}</span>
              <span className={styles.listMeta}>
                {requestMoneyLine(request)} · {requestPackageLine(request)}
              </span>
              {scheduler ? <span className={styles.listSchedule}>{scheduler}</span> : null}
              {request.notes ? <span className={styles.listMeta}>{request.notes}</span> : null}
            </button>
            <div className={styles.queueCardSide}>
              <span className={styles.statusChip}>{requestStatusLabel(request.status)}</span>
              {canAssign ? (
                <button type="button" className={styles.assignButton} onClick={() => onAssign(request)}>
                  Asignar
                </button>
              ) : null}
              {request.customer_phone ? (
                <DriverPhoneContact
                  phone={request.customer_phone}
                  compact
                  stopPropagation
                  className={styles.asidePhone}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function OffersList({ offers, nowMs }: { offers: DispatchMonitorOffer[]; nowMs: number }) {
  if (offers.length === 0) {
    return <p className={styles.emptyHint}>Sin ofertas abiertas.</p>;
  }
  return (
    <ul className={styles.list}>
      {offers.map((offer) => {
        const remaining = formatCountdown(offer.expires_at, nowMs);
        return (
          <li key={offer.id} className={styles.listItem}>
            <div className={styles.listMain}>
              <div className={styles.listContent}>
                <span className={styles.listTitle}>{offer.driver_name}</span>
                <span className={styles.listMeta}>
                  {formatShortId(offer.short_id)} · {offer.customer_name} · {offer.restaurant_name}
                </span>
                {offer.dropoff_address ? (
                  <span className={styles.listAddress}>{offer.dropoff_address}</span>
                ) : null}
                <span className={styles.listSchedule}>{offerCaseLine(offer)}</span>
              </div>
            </div>
            <div className={styles.listAside}>
              <span className={remaining === 'ahora' ? styles.alertChip : styles.dueChip}>
                {remaining === 'ahora' ? 'Expiró' : `Expira ${remaining}`}
              </span>
              <span className={styles.listMeta}>{formatTime(offer.expires_at)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CreditList({ holds }: { holds: DispatchMonitorCreditHold[] }) {
  if (holds.length === 0) {
    return <p className={styles.emptyHint}>Sin crédito retenido.</p>;
  }
  return (
    <ul className={styles.list}>
      {holds.map((hold) => (
        <li key={hold.id} className={styles.listItem}>
          <div className={styles.listMain}>
            <span className={styles.listTitle}>{hold.driver_name}</span>
            <span className={styles.listMeta}>
              {formatShortId(hold.short_id)} · {hold.customer_name} · {hold.restaurant_name}
            </span>
          </div>
          <span className={styles.creditChip}>{formatMoney(hold.amount_cents)}</span>
        </li>
      ))}
    </ul>
  );
}

function DriversList({
  drivers,
  maxPackages,
  filter,
  onFilterChange,
  focusedDriverId,
  onFocus,
}: {
  drivers: DispatchMonitorDriver[];
  maxPackages: number;
  filter: DriverFilter;
  onFilterChange: (filter: DriverFilter) => void;
  focusedDriverId: string | null;
  onFocus: (driver: DispatchMonitorDriver) => void;
}) {
  const counts = {
    all: drivers.length,
    online: drivers.filter((driver) => driver.is_online).length,
    stale: drivers.filter(isStaleGps).length,
    offline: drivers.filter((driver) => !driver.is_online).length,
  };
  const filtered = drivers.filter((driver) => driverMatchesFilter(driver, filter));
  const sorted = [...filtered].sort((a, b) => {
    if (filter === 'stale') {
      return (b.location_age_seconds ?? 0) - (a.location_age_seconds ?? 0);
    }
    return Number(b.is_online) - Number(a.is_online);
  });

  const filters: { id: DriverFilter; label: string; count: number; warn?: boolean }[] = [
    { id: 'all', label: 'Todos', count: counts.all },
    { id: 'online', label: 'En línea', count: counts.online },
    { id: 'stale', label: 'GPS viejo', count: counts.stale, warn: true },
    { id: 'offline', label: 'Offline', count: counts.offline },
  ];

  const emptyHint =
    filter === 'stale'
      ? 'Nadie con GPS viejo.'
      : filter === 'online'
        ? 'Nadie en línea.'
        : filter === 'offline'
          ? 'Nadie offline.'
          : 'Sin repartidores.';

  return (
    <>
      <div className={styles.filterRow} role="toolbar" aria-label="Filtrar repartidores">
        {filters.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.filterChip}${active ? ` ${styles.filterChipActive}` : ''}${
                item.warn ? ` ${styles.filterChipWarn}` : ''
              }`}
              aria-pressed={active}
              onClick={() => onFilterChange(item.id)}
            >
              {item.label}
              <span className={styles.filterCount}>{item.count}</span>
            </button>
          );
        })}
      </div>
      {sorted.length === 0 ? (
        <p className={styles.emptyHint}>{emptyHint}</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((driver) => {
            const occupation = driver.is_pre_free
              ? `Pre-libre ${driver.pre_free_eta_seconds ?? 0}s`
              : driver.active_request_status === 'in_transit'
                ? 'En camino'
                : driver.active_request_status === 'picked_up'
                  ? 'Recogido'
                  : driver.active_request_status === 'assigned'
                    ? 'Va al negocio'
                    : driver.open_offer_id
                      ? 'Oferta abierta'
                      : driver.status === 'invited'
                        ? 'Invitado'
                        : 'Libre';
            const packages = `${driver.active_package_count ?? 0}/${maxPackages} pq`;
            const credit = `${formatMoney(driver.credit_held_cents)} / ${formatMoney(driver.credit_limit_cents)}`;
            const focused = focusedDriverId === driver.id;
            const hasLocation = driver.last_lat != null && driver.last_lng != null;
            return (
              <li
                key={driver.id}
                className={`${styles.queueCard}${focused ? ` ${styles.queueCardFocused}` : ''}`}
              >
                <button
                  type="button"
                  className={styles.queueCardButton}
                  onClick={() => onFocus(driver)}
                  aria-pressed={focused}
                  aria-label={
                    hasLocation
                      ? `Ver ubicación de ${driver.first_name} ${driver.last_name}`
                      : `${driver.first_name} ${driver.last_name} sin ubicación GPS`
                  }
                >
                  <div className={styles.listMain}>
                    <DriverAvatar
                      firstName={driver.first_name}
                      lastName={driver.last_name}
                      profilePhotoPath={driver.profile_photo_path}
                      size="sm"
                    />
                    <div className={styles.listContent}>
                      <span className={styles.listTitle}>
                        {driver.first_name} {driver.last_name}
                      </span>
                      <DriverMetaTags
                        plate={driver.plate}
                        motorcycleColor={driver.motorcycle_color}
                        compartmentSize={driver.compartment_size}
                        creditAvailableCents={driver.credit_available_cents}
                      />
                      <span className={styles.listMeta}>
                        {occupation} · {packages} · crédito {credit}
                      </span>
                      <span className={styles.listMeta}>{gpsAgeLabel(driver.location_age_seconds)}</span>
                    </div>
                  </div>
                </button>
                <div className={styles.queueCardSide}>
                  <div className={styles.listAsideChips}>
                    <span
                      className={`${styles.statusChip} ${driver.is_online ? styles.chipOnline : styles.chipOffline}`}
                    >
                      {driver.is_online ? 'En línea' : 'Offline'}
                    </span>
                    {driver.status === 'invited' ? <span className={styles.warnChip}>Invitado</span> : null}
                    {driver.open_offer_id ? <span className={styles.dueChip}>Oferta</span> : null}
                    {driver.is_pre_free ? <span className={styles.chipOnline}>Pre-libre</span> : null}
                    {driver.credit_blocked ? <span className={styles.alertChip}>Sin crédito</span> : null}
                    {isStaleGps(driver) ? <span className={styles.warnChip}>GPS viejo</span> : null}
                  </div>
                  <DriverPhoneContact
                    phone={driver.phone}
                    compact
                    stopPropagation
                    className={styles.asidePhone}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function MonitorPage() {
  const { accessToken } = useAuth();
  const { canManagePartnerships } = useDeliveryProviderAccess();
  const { selectedZoneId, zones } = useDeliveryZone();
  const [snapshot, setSnapshot] = useState<DispatchMonitorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<DispatchMonitorSocketStatus>('offline');
  const [assigningRequest, setAssigningRequest] = useState<DispatchMonitorRequest | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [focusedRequestId, setFocusedRequestId] = useState<string | null>(null);
  const [focusedDriverId, setFocusedDriverId] = useState<string | null>(null);
  const [driverFilter, setDriverFilter] = useState<DriverFilter>('all');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadSnapshot = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const data = await getMyDispatchMonitor(accessToken, selectedZoneId);
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el monitor');
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedZoneId]);

  useEffect(() => {
    setLoading(true);
    void loadSnapshot();
  }, [loadSnapshot]);

  useDispatchMonitorSocket(accessToken, {
    onEvent: () => {
      void loadSnapshot();
    },
    onStatusChange: setConnectionStatus,
    onReconnect: () => {
      void loadSnapshot();
    },
  });

  useEffect(() => {
    if (!accessToken) return;
    const timer = window.setInterval(() => {
      void loadSnapshot();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [accessToken, loadSnapshot]);

  const queueRequests = useMemo(
    () =>
      (snapshot?.requests ?? []).filter((row) =>
        ['scheduled', 'searching', 'offered'].includes(row.status),
      ),
    [snapshot],
  );

  const activeRequests = useMemo(
    () =>
      (snapshot?.requests ?? []).filter((row) =>
        ['assigned', 'picked_up', 'in_transit'].includes(row.status),
      ),
    [snapshot],
  );

  const unassignedRequests = useMemo(
    () => (snapshot?.requests ?? []).filter((row) => row.status === 'unassigned'),
    [snapshot],
  );

  useEffect(() => {
    if (!focusedRequestId) return;
    const stillVisible = (snapshot?.requests ?? []).some((row) => row.id === focusedRequestId);
    if (!stillVisible) setFocusedRequestId(null);
  }, [focusedRequestId, snapshot]);

  useEffect(() => {
    if (!focusedDriverId) return;
    const stillVisible = (snapshot?.drivers ?? []).some((row) => row.id === focusedDriverId);
    if (!stillVisible) setFocusedDriverId(null);
  }, [focusedDriverId, snapshot]);

  function handleFocusRequest(request: DispatchMonitorRequest) {
    setFocusedDriverId(null);
    setFocusedRequestId((current) => (current === request.id ? null : request.id));
  }

  function handleFocusDriver(driver: DispatchMonitorDriver) {
    setFocusedRequestId(null);
    setFocusedDriverId((current) => (current === driver.id ? null : driver.id));
  }

  function handleDriverFilter(next: DriverFilter) {
    setDriverFilter((current) => (current === next && next !== 'all' ? 'all' : next));
    document.getElementById('monitor-drivers')?.scrollIntoView({ block: 'nearest' });
  }

  const metrics = snapshot?.metrics;

  async function handleManualOffer(driverId: string) {
    if (!accessToken || !assigningRequest) return;
    setAssigning(true);
    setAssignError(null);
    try {
      await createMyManualDispatchOffer(accessToken, assigningRequest.id, driverId);
      setAssigningRequest(null);
      await loadSnapshot();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'No se pudo enviar la oferta');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <PanelPageShell
      title="Monitor"
      subtitle="Observabilidad en tiempo real de pedidos, repartidores y demanda de tu operación."
      styles={panelStyles as PanelPageStyles}
      action={
        <div className={styles.liveBadge} data-status={connectionStatus}>
          <span className={styles.liveDot} aria-hidden />
          {connectionLabel(connectionStatus)}
          {snapshot ? (
            <span className={styles.updatedAt}>
              · {formatTime(snapshot.generated_at)}
            </span>
          ) : null}
        </div>
      }
    >
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      {metrics?.tasks_backend === 'stub' ? (
        <div className={styles.stubNotice} role="status">
          Scheduler en modo local (stub): las búsquedas, expiraciones y reintentos no se disparan
          solos. Usa Asignar o el endpoint interno de tasks.
        </div>
      ) : null}

      {loading && !snapshot ? (
        <div className={styles.loading}>Cargando monitor…</div>
      ) : (
        <>
          <section className={styles.metricsRow} aria-label="Indicadores">
            <MetricCard
              label="En línea"
              value={metrics?.drivers_online ?? 0}
              tone="toneOnline"
              pressed={driverFilter === 'online'}
              onClick={() => handleDriverFilter('online')}
            />
            <MetricCard
              label="Offline"
              value={metrics?.drivers_offline ?? 0}
              pressed={driverFilter === 'offline'}
              onClick={() => handleDriverFilter('offline')}
            />
            <MetricCard
              label="GPS viejo"
              value={metrics?.drivers_location_stale ?? 0}
              tone={(metrics?.drivers_location_stale ?? 0) > 0 || driverFilter === 'stale' ? 'toneDue' : undefined}
              pressed={driverFilter === 'stale'}
              onClick={() => handleDriverFilter('stale')}
            />
            <MetricCard label="Cola" value={metrics?.requests_pending ?? 0} />
            <MetricCard label="Listos" value={metrics?.requests_due_search ?? 0} tone="toneDue" />
            <MetricCard label="En curso" value={metrics?.requests_in_progress ?? 0} />
            <MetricCard label="Ofertas" value={metrics?.offers_open ?? 0} />
            <MetricCard
              label="Sin asignar"
              value={metrics?.requests_unassigned ?? unassignedRequests.length}
              tone={(metrics?.requests_unassigned ?? 0) > 0 ? 'toneDue' : undefined}
            />
            <MetricCard
              label="Crédito retenido"
              value={metrics?.credit_holds_active ?? 0}
            />
            <MetricCard
              label="Sin crédito"
              value={metrics?.drivers_credit_blocked ?? 0}
              tone={(metrics?.drivers_credit_blocked ?? 0) > 0 ? 'toneDue' : undefined}
            />
            {metrics?.high_demand ? (
              <MetricCard
                label="Demanda"
                value="Alta"
                tone="toneDemand"
                hint={demandReasonLine(metrics)}
              />
            ) : (
              <MetricCard label="Demanda" value="Normal" />
            )}
          </section>

          <div className={styles.layout}>
            <section className={styles.mapSection} aria-label="Mapa en vivo">
              <DispatchMonitorMap
                snapshot={snapshot}
                zones={zones}
                selectedZoneId={selectedZoneId}
                focusedRequestId={focusedRequestId}
                focusedDriverId={focusedDriverId}
              />
              <div className={styles.mapLegend}>
                <span>
                  <span className={styles.legendZone} aria-hidden /> Zona de cobertura
                </span>
                <span>
                  <span className={styles.legendDriver} aria-hidden /> Repartidor
                </span>
                <span>
                  <span className={styles.legendRestaurant} aria-hidden /> Restaurante
                </span>
                <span>
                  <span className={styles.legendDropoff} aria-hidden /> Entrega
                </span>
                <span>
                  <span className={styles.legendRequestRoute} aria-hidden /> Ruta en solicitud
                </span>
                <span>
                  <span className={styles.legendRoute} aria-hidden /> Ruta activa
                </span>
              </div>
            </section>

            <aside className={styles.panels}>
              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>Cola de pedidos</h2>
                <QueueList
                  requests={queueRequests}
                  canAssign={canManagePartnerships}
                  nowMs={nowMs}
                  focusedRequestId={focusedRequestId}
                  onFocus={handleFocusRequest}
                  onAssign={(request) => {
                    setAssignError(null);
                    setAssigningRequest(request);
                  }}
                />
              </section>

              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>Sin asignar</h2>
                <QueueList
                  requests={unassignedRequests}
                  canAssign={canManagePartnerships}
                  nowMs={nowMs}
                  emptyHint="Sin pedidos sin asignar."
                  focusedRequestId={focusedRequestId}
                  onFocus={handleFocusRequest}
                  onAssign={(request) => {
                    setAssignError(null);
                    setAssigningRequest(request);
                  }}
                />
              </section>

              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>En curso</h2>
                <ActiveList
                  requests={activeRequests}
                  canAssign={canManagePartnerships}
                  nowMs={nowMs}
                  focusedRequestId={focusedRequestId}
                  onFocus={handleFocusRequest}
                  onAssign={(request) => {
                    setAssignError(null);
                    setAssigningRequest(request);
                  }}
                />
              </section>

              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>Ofertas abiertas</h2>
                <OffersList offers={snapshot?.offers ?? []} nowMs={nowMs} />
              </section>

              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>Crédito retenido (efectivo)</h2>
                <CreditList holds={snapshot?.credit_holds ?? []} />
              </section>

              <section id="monitor-drivers" className={styles.panel}>
                <h2 className={styles.panelTitle}>Repartidores</h2>
                <DriversList
                  drivers={snapshot?.drivers ?? []}
                  maxPackages={metrics?.max_active_packages_per_driver ?? 3}
                  filter={driverFilter}
                  onFilterChange={handleDriverFilter}
                  focusedDriverId={focusedDriverId}
                  onFocus={handleFocusDriver}
                />
              </section>
            </aside>
          </div>
        </>
      )}
      <AssignDriverDrawer
        open={assigningRequest !== null}
        request={assigningRequest}
        drivers={snapshot?.drivers ?? []}
        submitting={assigning}
        error={assignError}
        onClose={() => {
          setAssigningRequest(null);
          setAssignError(null);
        }}
        onAssign={(driverId) => {
          void handleManualOffer(driverId);
        }}
      />
    </PanelPageShell>
  );
}
